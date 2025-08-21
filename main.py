# main.py (Updated)
import asyncio
import flet as ft
import json

from src.functions import theme, navigation_bar
from src.pages.explore import explore_page
from src.functions.network_manager import NetworkManager
from src.pages.chat_page import chat_page
from src.pages.settings import settings_page
from src.functions.alert_dialog import chat_request_dialog


async def main(page: ft.Page):
    page.title = "Quick Drop"
    page.window.center()
    page.window.maximized = True

    network_manager = NetworkManager(page, ui_update_callback=None)
    page.session.set("network_manager", network_manager)

    async def handle_incoming_message(data: dict, ws):
        message_type = data.get("type")

        if message_type == "chat_request":
            async def accept_action():
                page.session.set("active_ws_connection", ws)

                await page.client_storage.set_async("chat_target_info", data.get("device_info"))
                response = {"type": "chat_accepted", "from_device": network_manager.device_name}
                await ws.send_str(json.dumps(response))
                page.go("/chat")

            async def decline_action():
                response = {"type": "chat_declined"}
                await ws.send_str(json.dumps(response))

            chat_request_dialog(
                page=page,
                from_device=data.get("from_device", "An unknown device"),
                on_accept=accept_action,
                on_decline=decline_action
            )

    network_manager.message_handler_callback = handle_incoming_message
    asyncio.create_task(network_manager.start_server_async())

    async def window_event(e):
        if e.data == "close":
            await network_manager.stop_async()
            await asyncio.sleep(0.5)
            page.window.destroy()

    page.on_window_event = window_event
    theme.set_theme(page)
    page.navigation_bar = navigation_bar.set_navigation_bar(page)

    main_content = ft.Column(
        scroll=ft.ScrollMode.ADAPTIVE,
        expand=True
    )

    page.add(
        ft.SafeArea(
            main_content,
            expand=True,
        )
    )

    async def route_change(route):
        print(f"Route changed to: {page.route}")
        page.appbar = None
        main_content.controls.clear()  # Clear content on every route change

        if page.route == "/":
            page.navigation_bar.visible = True
            await explore_page(page, main_content)
        elif page.route == "/settings":
            page.navigation_bar.visible = True
            await settings_page(page, main_content)
        elif page.route.startswith("/chat"):
            target_info = await page.client_storage.get_async("chat_target_info")
            if target_info:
                await chat_page(page, main_content, target_info)

        page.update()

    page.on_route_change = route_change
    page.go("/")


if __name__ == "__main__":
    ft.app(
        target=main,
        assets_dir="src/assets"
    )