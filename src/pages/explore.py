# src/pages/explore.py (Corrected)
import flet as ft
import asyncio
import json
import aiohttp
from ..functions.network_manager import NetworkManager, SERVER_PORT
import socket


async def explore_page(page: ft.Page, main_content: ft.Column) -> None:
    device_list_view = ft.Column(
        controls=[ft.ProgressRing()]
    )

    async def request_chat(e: ft.ControlEvent):
        device_info = e.control.data
        if not device_info:
            return

        target_ip = device_info['ip']
        network_manager: NetworkManager = page.session.get("network_manager")
        my_device_name = network_manager.device_name

        page.snack_bar = ft.SnackBar(ft.Text(f"Sending chat request to {device_info['name']}..."), open=True)
        await page.update()

        session = aiohttp.ClientSession()
        try:
            ws = await session.ws_connect(f"http://{target_ip}:{SERVER_PORT}/ws")

            request_message = {
                "type": "chat_request",
                "from_device": my_device_name,
                "device_info": {"name": my_device_name, "ip": network_manager._get_local_ip()}
            }
            await ws.send_str(json.dumps(request_message))

            print("Waiting for chat response...")
            async for msg in ws:
                response = json.loads(msg.data)
                if response.get("type") == "chat_accepted":
                    print("Chat request accepted!")
                    page.session.set("active_ws_connection", ws)
                    page.session.set("aiohttp_session", session)
                    await page.client_storage.set_async("chat_target_info", device_info)
                    page.go("/chat")
                    return

                elif response.get("type") == "chat_declined":
                    print("Chat request declined.")
                    page.snack_bar = ft.SnackBar(ft.Text("Chat request declined."), open=True)
                    page.update()
                    break

            await ws.close()
            await session.close()

        except Exception as ex:
            print(f"Error sending chat request: {ex}")
            page.snack_bar = ft.SnackBar(ft.Text(f"Could not connect to {device_info['name']}."), open=True)
            page.update()
            if not session.closed:
                await session.close()

    def update_ui_with_devices(devices: dict):
        network_manager: NetworkManager = page.session.get("network_manager")
        device_tiles = []
        for name, info in devices.items():
            if name == network_manager.my_service_name:
                continue

            device_name = info.properties.get(b'device_name', b'Unknown Device').decode('utf-8')
            raw_os = info.properties.get(b'os', b'unknown').decode('utf-8')
            device_os = raw_os.replace("PagePlatform.", "").capitalize()

            # --- THIS IS THE FIX ---
            # Corrected the typo from inet_oa to inet_ntoa
            ip_address = socket.inet_ntoa(info.addresses[0])

            current_device_info = {"ip": ip_address, "name": device_name}

            device_tiles.append(
                ft.ListTile(
                    leading=ft.Icon(
                        ft.Icons.SMARTPHONE if device_os.lower() in ['android', 'ios'] else ft.Icons.LAPTOP_WINDOWS),
                    title=ft.Text(device_name),
                    subtitle=ft.Text(f"{device_os} - {ip_address}"),
                    data=current_device_info,
                    on_click=request_chat
                )
            )

        device_list_view.controls.clear()
        if not device_tiles:
            device_list_view.controls.append(
                ft.ListTile(
                    leading=ft.ProgressRing(height=20, width=20, stroke_width=3),
                    title=ft.Text("Searching..."),
                    subtitle=ft.Text("No other devices found yet."),
                )
            )
        else:
            device_list_view.controls.extend(device_tiles)
        if page:
            page.update()

    network_manager: NetworkManager = page.session.get("network_manager")
    network_manager.ui_update_callback = update_ui_with_devices
    update_ui_with_devices(network_manager.discovered_devices)

    if not network_manager.is_running():
        asyncio.create_task(network_manager.start_discovery_async())

    content = ft.Card(
        content=ft.Container(
            content=ft.Column(
                [
                    ft.ListTile(title=ft.Text("Available Devices")),
                    ft.Divider(height=1),
                    device_list_view,
                ],
                spacing=0,
            ),
            padding=ft.padding.symmetric(vertical=10),
        )
    )

    main_content.controls.clear()
    main_content.controls.append(content)