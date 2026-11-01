import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.services.connection_manager import manager
from app.ws import route

WS_URL = "/ws/connect"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    assert manager.devices == {}


@pytest.fixture(autouse=True)
def short_grace(monkeypatch):
    monkeypatch.setattr(route, "RECONNECT_GRACE_SECONDS", 0.3)


def register(ws, name="Device", **resume):
    ws.send_json({"type": "register", "device_name": name, "device_type": "desktop", **resume})
    welcome = ws.receive_json()
    assert welcome["type"] == "welcome"
    peers = ws.receive_json()
    assert peers["type"] == "peer_list"
    return welcome, peers["peers"]


def next_of_type(ws, message_type):
    while True:
        message = ws.receive_json()
        if message["type"] == message_type:
            return message


def wait_for_removal(device_id):
    deadline = time.monotonic() + 3
    while device_id in manager.devices and time.monotonic() < deadline:
        time.sleep(0.02)
    assert device_id not in manager.devices


def test_device_is_named_from_its_first_message(client):
    with client.websocket_connect(WS_URL) as first:
        register(first, "First")
        with client.websocket_connect(WS_URL) as second:
            _, peers = register(second, "Second")
            assert [peer["device_name"] for peer in peers] == ["First"]

            joined = first.receive_json()
            assert joined["type"] == "peer_joined"
            assert joined["device_name"] == "Second"
            second.send_json({"type": "leave"})
            next_of_type(first, "peer_left")
        first.send_json({"type": "leave"})


def test_socket_that_does_not_register_is_refused(client):
    with client.websocket_connect(WS_URL) as ws:
        ws.send_json({"type": "pong"})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 1008
    assert manager.devices == {}


def test_deliberate_leave_notifies_peers_immediately(client):
    with client.websocket_connect(WS_URL) as watcher:
        register(watcher, "Watcher")
        with client.websocket_connect(WS_URL) as leaver:
            welcome, _ = register(leaver, "Leaver")
            next_of_type(watcher, "peer_joined")
            leaver.send_json({"type": "leave"})
            left = next_of_type(watcher, "peer_left")
            assert left["device_id"] == welcome["device_id"]
        watcher.send_json({"type": "leave"})


def test_reconnecting_within_grace_keeps_identity_and_hides_the_drop(client):
    with client.websocket_connect(WS_URL) as watcher:
        register(watcher, "Watcher")

        with client.websocket_connect(WS_URL) as dropped:
            welcome, _ = register(dropped, "Phone")
            next_of_type(watcher, "peer_joined")
        assert manager.is_waiting_to_reconnect(welcome["device_id"]) or welcome["device_id"] in manager.devices

        with client.websocket_connect(WS_URL) as resumed:
            again, _ = register(
                resumed, "Phone",
                resume_device_id=welcome["device_id"],
                resume_secret=welcome["session_secret"],
            )
            assert again["device_id"] == welcome["device_id"]
            assert again["resumed"] is True

            # Well past the grace period, the resumed device must still be present.
            time.sleep(0.5)
            assert welcome["device_id"] in manager.devices

            # The watcher only saw it rejoin, never leave.
            assert watcher.receive_json()["type"] == "peer_joined"
            resumed.send_json({"type": "leave"})
            left = watcher.receive_json()
            assert left["type"] == "peer_left"
        watcher.send_json({"type": "leave"})


def test_wrong_secret_cannot_take_over_a_session(client):
    with client.websocket_connect(WS_URL) as owner:
        welcome, _ = register(owner, "Owner")
        with client.websocket_connect(WS_URL) as attacker:
            other, _ = register(
                attacker, "Attacker",
                resume_device_id=welcome["device_id"],
                resume_secret="wrong",
            )
            assert other["device_id"] != welcome["device_id"]
            assert other["resumed"] is False
            attacker.send_json({"type": "leave"})
        owner.send_json({"type": "leave"})


def test_device_is_removed_after_grace_expires(client):
    with client.websocket_connect(WS_URL) as watcher:
        register(watcher, "Watcher")
        with client.websocket_connect(WS_URL) as dropped:
            welcome, _ = register(dropped, "Phone")
            next_of_type(watcher, "peer_joined")

        left = next_of_type(watcher, "peer_left")
        assert left["device_id"] == welcome["device_id"]
        wait_for_removal(welcome["device_id"])
        watcher.send_json({"type": "leave"})


def test_newer_socket_replaces_an_older_one(client):
    with client.websocket_connect(WS_URL) as older:
        welcome, _ = register(older, "Phone")
        with client.websocket_connect(WS_URL) as newer:
            again, _ = register(
                newer, "Phone",
                resume_device_id=welcome["device_id"],
                resume_secret=welcome["session_secret"],
            )
            assert again["device_id"] == welcome["device_id"]
            with pytest.raises(WebSocketDisconnect) as closed:
                older.receive_json()
            assert closed.value.code == route.REPLACED_CLOSE_CODE

            # The old socket closing must not start the removal timer.
            time.sleep(0.5)
            assert welcome["device_id"] in manager.devices
            newer.send_json({"type": "leave"})


def test_signaling_sent_during_a_drop_arrives_after_reconnecting(client):
    with client.websocket_connect(WS_URL) as sender:
        sender_welcome, _ = register(sender, "Sender")

        with client.websocket_connect(WS_URL) as dropped:
            welcome, _ = register(dropped, "Phone")
            next_of_type(sender, "peer_joined")

        sender.send_json({"type": "sdp_offer", "to": welcome["device_id"], "sdp": {"type": "offer"}})
        deadline = time.monotonic() + 1
        while not manager.devices[welcome["device_id"]].pending_messages and time.monotonic() < deadline:
            time.sleep(0.01)

        with client.websocket_connect(WS_URL) as resumed:
            register(
                resumed, "Phone",
                resume_device_id=welcome["device_id"],
                resume_secret=welcome["session_secret"],
            )
            offer = resumed.receive_json()
            assert offer["type"] == "sdp_offer"
            assert offer["from_id"] == sender_welcome["device_id"]
            resumed.send_json({"type": "leave"})
        sender.send_json({"type": "leave"})
