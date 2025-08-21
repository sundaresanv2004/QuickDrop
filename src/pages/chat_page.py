import flet as ft


async def chat_page(page: ft.Page, main_content: ft.Column, target_device_info: dict):
    target_name = target_device_info['name']

    chat_view = ft.ListView(
        expand=True,
        spacing=10,
        auto_scroll=True,
        controls=[
            ft.Text("This is the beginning of your conversation."),
        ]
    )

    new_message_field = ft.TextField(
        hint_text="Write a message...",
        expand=True,
        filled=True,
        border_radius=30,
    )

    send_button = ft.IconButton(
        icon=ft.Icons.SEND_ROUNDED,
        tooltip="Send message",
    )

    page.navigation_bar.visible = False

    async def go_back(e):
        page.go('/')

    page.appbar = ft.AppBar(
        leading=ft.IconButton(
            icon=ft.Icons.ARROW_BACK_ROUNDED,
            on_click=go_back,
            tooltip="Back to devices"
        ),
        title=ft.Text(f"Chat with {target_name}"),
        center_title=True,
        bgcolor=ft.Colors.ON_PRIMARY,
    )

    main_content.controls.clear()
    main_content.controls.extend([
        chat_view,
        ft.Row(
            controls=[
                new_message_field,
                send_button,
            ]
        ),
    ])

    page.update()
