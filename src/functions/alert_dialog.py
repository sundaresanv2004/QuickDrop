import flet as ft


def edit_device_name_dialog(page: ft.Page, current_name: str, on_save_callback) -> None:
    device_name_field = ft.TextField(
        hint_text="New device name",
        value=current_name,
        autofocus=True,
    )

    def save_new_name(e):
        new_name = device_name_field.value.strip()
        if new_name:
            page.client_storage.set("device_name", new_name)
            on_save_callback(new_name)
            page.close(edit_dialog)
            page.snack_bar = ft.SnackBar(ft.Text(f"Device name changed to {new_name}"), open=True)
            page.update()

    edit_dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("Change Device Name"),
        content=device_name_field,
        actions=[
            ft.TextButton(text="Cancel", on_click=lambda e: page.close(edit_dialog)),
            ft.FilledButton(text="Save", on_click=save_new_name)
        ],
        actions_alignment=ft.MainAxisAlignment.END,
    )

    page.open(edit_dialog)
    page.update()


def chat_request_dialog(page: ft.Page, from_device: str, on_accept, on_decline) -> None:
    async def accept_clicked(e):
        page.close(dialog)
        await on_accept()

    async def decline_clicked(e):
        page.close(dialog)
        await on_decline()

    dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("Chat Request"),
        content=ft.Text(f"{from_device} wants to chat with you."),
        actions=[
            ft.TextButton("Decline", on_click=decline_clicked),
            ft.FilledButton("Accept", on_click=accept_clicked),
        ],
        actions_alignment=ft.MainAxisAlignment.END,
    )

    page.open(dialog)
    page.update()
