from app.ws.route import describe_room, normalize_ip_to_room


def test_ipv4_room_summary_hides_the_address():
    room = describe_room(normalize_ip_to_room("203.0.113.7"))

    assert room["ip_version"] == 4
    assert len(room["hint"]) == 8
    assert "203" not in room["hint"]


def test_devices_in_one_ipv6_prefix_share_a_room_code():
    first = describe_room(normalize_ip_to_room("2001:db8:1:2::10"))
    second = describe_room(normalize_ip_to_room("2001:db8:1:2:aaaa::20"))

    assert first["ip_version"] == 6
    assert first == second


def test_different_networks_get_different_room_codes():
    assert describe_room("203.0.113.7")["hint"] != describe_room("203.0.113.8")["hint"]
