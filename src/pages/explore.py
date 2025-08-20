# src/pages/explore.py (Updated)
import flet as ft
import asyncio
from ..functions.network_manager import NetworkManager
import socket


async def explore_page(page: ft.Page, main_content: ft.Column) -> None:
    device_list_view = ft.Column(
        controls=[
            ft.ListTile(
                leading=ft.Icon(ft.Icons.HOURGLASS_EMPTY_ROUNDED),
                title=ft.Text("Searching for devices..."),
                subtitle=ft.Text("Make sure other devices are on the same Wi-Fi network."),
            )
        ]
    )

    def update_ui_with_devices(devices: dict):
        if not devices:
            device_list_view.controls.clear()
            device_list_view.controls.append(
                ft.ListTile(
                    leading=ft.Icon(ft.Icons.INFO_OUTLINE),
                    title=ft.Text("No other devices found."),
                    subtitle=ft.Text("Still searching..."),
                )
            )
        else:
            device_list_view.controls.clear()
            for name, info in devices.items():
                device_name = info.properties.get(b'device_name', b'Unknown Device').decode('utf-8')
                device_os = info.properties.get(b'os', b'unknown').decode('utf-8')
                ip_address = socket.inet_ntoa(info.addresses[0])

                # Create a UI tile for each discovered device
                device_list_view.controls.append(
                    ft.ListTile(
                        leading=ft.Icon(
                            ft.Icons.SMARTPHONE if device_os in ['android', 'ios'] else ft.Icons.LAPTOP_WINDOWS),
                        title=ft.Text(device_name),
                        subtitle=ft.Text(f"{device_os.capitalize()} - {ip_address}"),
                        on_click=lambda e, ip=ip_address: print(f"Clicked on {ip}")  # Placeholder for chat
                    )
                )

        # This is crucial! It tells Flet to redraw the screen with our changes.
        page.update()

    network_manager = NetworkManager(page, update_ui_with_devices)
    page.session.set("network_manager", network_manager)
    asyncio.create_task(network_manager.start_discovery_async())

    content = ft.Card(
        content=ft.Container(
            content=ft.Column(
                [
                    ft.ListTile(
                        title=ft.Text("Available Devices"),
                        trailing=ft.IconButton(
                            icon=ft.Icons.REFRESH_ROUNDED,
                            tooltip="Refresh list"
                        ),
                    ),
                    ft.Divider(height=1),
                    device_list_view,  # Add our dynamic list here
                ],
                spacing=0,
            ),
            padding=ft.padding.symmetric(vertical=10),
        )
    )

    main_content.controls.clear()
    main_content.controls.append(content)
    page.update()
