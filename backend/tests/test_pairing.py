import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.connection_manager import manager
from app.ws import route
from app.ws.route import normalize_ip_to_room, resolve_client_ip

WS_URL = "/ws/connect"
TEST_HEADER = "x-test-client-ip"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HEADER", TEST_HEADER)
    with TestClient(app) as test_client:
        yield test_client
    assert manager.devices == {}
    assert manager.links == {}
    assert manager.pair_tokens == {}


def connect(client, ip):
    return client.websocket_connect(WS_URL, headers={TEST_HEADER: ip})


def register(ws, name):
    ws.send_json({"type": "register", "device_name": name, "device_type": "mobile"})
    welcome = ws.receive_json()
    peers = ws.receive_json()
    assert peers["type"] == "peer_list"
    return welcome["device_id"], peers["peers"]


def next_of_type(ws, message_type):
    while True:
        message = ws.receive_json()
        if message["type"] == message_type:
            return message


def create_token(ws):
    ws.send_json({"type": "create_pair_link"})
    return next_of_type(ws, "pair_link")


def leave(*sockets):
    for ws in sockets:
        ws.send_json({"type": "leave"})


def pair(creator, joiner):
    token = create_token(creator)["token"]
    joiner.send_json({"type": "join_pair_link", "token": token})
    return next_of_type(joiner, "pair_joined"), next_of_type(creator, "pair_joined")


def test_devices_on_different_networks_start_hidden_from_each_other(client):
    with connect(client, "203.0.113.1") as first, connect(client, "198.51.100.1") as second:
        _, first_peers = register(first, "First")
        _, second_peers = register(second, "Second")
        assert first_peers == []
        assert second_peers == []
        leave(first, second)


def test_link_makes_two_networks_visible_to_each_other(client):
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner:
        creator_id, _ = register(creator, "Creator")
        joiner_id, _ = register(joiner, "Joiner")

        token_message = create_token(creator)
        assert token_message["expires_in"] == route.PAIR_LINK_LIFETIME_SECONDS
        assert len(token_message["token"]) >= 22

        joiner.send_json({"type": "join_pair_link", "token": token_message["token"]})
        joined = next_of_type(joiner, "pair_joined")
        created = next_of_type(creator, "pair_joined")
        assert joined["peer"]["device_id"] == creator_id
        assert joined["peer"]["device_name"] == "Creator"
        assert joined["peer"]["is_linked"] is True
        assert created["peer"]["device_id"] == joiner_id
        leave(creator, joiner)


def test_linked_devices_see_status_changes_and_departure(client):
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner:
        register(creator, "Creator")
        joiner_id, _ = register(joiner, "Joiner")
        pair(creator, joiner)

        joiner.send_json({"type": "update_status", "is_busy": True})
        updated = next_of_type(creator, "peer_updated")
        assert updated["device_id"] == joiner_id
        assert updated["is_busy"] is True

        joiner.send_json({"type": "leave"})
        assert next_of_type(creator, "peer_left")["device_id"] == joiner_id
        leave(creator)


def test_link_works_only_once(client):
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner, \
            connect(client, "192.0.2.1") as late:
        register(creator, "Creator")
        register(joiner, "Joiner")
        register(late, "Late")

        token = create_token(creator)["token"]
        joiner.send_json({"type": "join_pair_link", "token": token})
        next_of_type(joiner, "pair_joined")

        late.send_json({"type": "join_pair_link", "token": token})
        assert next_of_type(late, "pair_error")["reason"] == "invalid"
        leave(creator, joiner, late)


def test_expired_link_is_refused(client, monkeypatch):
    monkeypatch.setattr(route, "PAIR_LINK_LIFETIME_SECONDS", -1)
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner:
        register(creator, "Creator")
        register(joiner, "Joiner")
        token = create_token(creator)["token"]

        joiner.send_json({"type": "join_pair_link", "token": token})
        assert next_of_type(joiner, "pair_error")["reason"] == "invalid"
        leave(creator, joiner)


def test_cancelled_and_replaced_links_stop_working(client):
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner:
        register(creator, "Creator")
        register(joiner, "Joiner")

        replaced = create_token(creator)["token"]
        current = create_token(creator)["token"]
        joiner.send_json({"type": "join_pair_link", "token": replaced})
        assert next_of_type(joiner, "pair_error")["reason"] == "invalid"

        creator.send_json({"type": "cancel_pair_link"})
        deadline = time.monotonic() + 3
        while manager.pair_tokens and time.monotonic() < deadline:
            time.sleep(0.01)
        joiner.send_json({"type": "join_pair_link", "token": current})
        assert next_of_type(joiner, "pair_error")["reason"] == "invalid"
        leave(creator, joiner)


def test_opening_your_own_link_is_refused_and_keeps_it_usable(client):
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner:
        register(creator, "Creator")
        register(joiner, "Joiner")
        token = create_token(creator)["token"]

        creator.send_json({"type": "join_pair_link", "token": token})
        assert next_of_type(creator, "pair_error")["reason"] == "self"

        joiner.send_json({"type": "join_pair_link", "token": token})
        next_of_type(joiner, "pair_joined")
        leave(creator, joiner)


def test_unknown_token_is_refused(client):
    with connect(client, "203.0.113.1") as device:
        register(device, "Device")
        device.send_json({"type": "join_pair_link", "token": "made-up"})
        assert next_of_type(device, "pair_error")["reason"] == "invalid"
        leave(device)


def test_messages_cannot_reach_a_device_on_another_network(client):
    with connect(client, "203.0.113.1") as sender, connect(client, "198.51.100.1") as stranger, \
            connect(client, "203.0.113.1") as neighbor:
        register(sender, "Sender")
        stranger_id, _ = register(stranger, "Stranger")
        neighbor_id, _ = register(neighbor, "Neighbor")
        next_of_type(sender, "peer_joined")

        sender.send_json({"type": "connect_request", "to": stranger_id})
        sender.send_json({"type": "sdp_offer", "to": stranger_id, "sdp": {}})
        sender.send_json({"type": "connect_request", "to": neighbor_id})

        assert next_of_type(neighbor, "connect_request")["to"] == neighbor_id

        # Anything relayed to the stranger would arrive before this reply.
        stranger.send_json({"type": "create_pair_link"})
        assert stranger.receive_json()["type"] == "pair_link"
        leave(sender, stranger, neighbor)


def test_linked_devices_can_exchange_signaling(client):
    with connect(client, "203.0.113.1") as creator, connect(client, "198.51.100.1") as joiner:
        creator_id, _ = register(creator, "Creator")
        joiner_id, _ = register(joiner, "Joiner")
        pair(creator, joiner)

        joiner.send_json({"type": "connect_request", "to": creator_id})
        request = next_of_type(creator, "connect_request")
        assert request["from_id"] == joiner_id
        leave(creator, joiner)


def test_accepted_session_keeps_signaling_after_a_network_change(client):
    with connect(client, "203.0.113.1") as stays:
        stays_id, _ = register(stays, "Stays")
        with connect(client, "203.0.113.1") as moves:
            moves.send_json({"type": "register", "device_name": "Moves", "device_type": "mobile"})
            welcome = moves.receive_json()
            moves.receive_json()
            next_of_type(stays, "peer_joined")

            moves.send_json({"type": "connect_request", "to": stays_id})
            next_of_type(stays, "connect_request")
            stays.send_json({"type": "connect_accept", "to": welcome["device_id"]})
            next_of_type(moves, "connect_accept")

            with connect(client, "198.51.100.1") as moved:
                moved.send_json({
                    "type": "register", "device_name": "Moves", "device_type": "mobile",
                    "resume_device_id": welcome["device_id"],
                    "resume_secret": welcome["session_secret"],
                })
                assert moved.receive_json()["resumed"] is True
                peers = moved.receive_json()["peers"]
                assert [peer["device_id"] for peer in peers] == [stays_id]

                moved.send_json({"type": "sdp_offer", "to": stays_id, "sdp": {"type": "offer"}})
                assert next_of_type(stays, "sdp_offer")["from_id"] == welcome["device_id"]
                leave(moved, stays)


def test_client_headers_are_ignored_without_a_trusted_header(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HEADER", raising=False)
    forged = {"x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "6.6.6.6", "x-real-ip": "6.6.6.6"}
    assert resolve_client_ip(forged, "203.0.113.1") == "203.0.113.1"


def test_only_the_named_header_is_trusted(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HEADER", "CF-Connecting-IP")
    headers = {"x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "198.51.100.1"}
    assert resolve_client_ip(headers, "10.0.0.1") == "198.51.100.1"


def test_forged_entries_in_a_forwarded_list_are_ignored(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HEADER", "x-forwarded-for")
    assert resolve_client_ip({"x-forwarded-for": "6.6.6.6, 198.51.100.1"}, "10.0.0.1") == "198.51.100.1"


def test_missing_trusted_header_falls_back_to_the_socket(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HEADER", "cf-connecting-ip")
    assert resolve_client_ip({}, "10.0.0.1") == "10.0.0.1"


def test_forged_header_cannot_join_another_room(client, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HEADER", "cf-connecting-ip")
    with client.websocket_connect(WS_URL, headers={"cf-connecting-ip": "203.0.113.1"}) as victim:
        register(victim, "Victim")
        monkeypatch.delenv("TRUSTED_PROXY_HEADER")
        with client.websocket_connect(WS_URL, headers={"cf-connecting-ip": "203.0.113.1"}) as attacker:
            _, peers = register(attacker, "Attacker")
            assert peers == []
            leave(attacker)
        leave(victim)
    assert normalize_ip_to_room("203.0.113.1") == "203.0.113.1"
