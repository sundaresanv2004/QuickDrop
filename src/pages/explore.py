import flet as ft


def explore_page(page: ft.Page, main_content: ft.Column) -> None:
    device_list = ft.Column(
        [
            ft.ListTile(
                leading=ft.Icon(ft.Icons.INFO_OUTLINE),
                title=ft.Text("No devices found."),
                subtitle=ft.Text("Tap the refresh icon to scan again."),
            ),
            ft.ListTile(
                leading=ft.Icon(ft.Icons.INFO_OUTLINE),
                title=ft.Text("OS Type"),
                subtitle=ft.Text(f"{page.platform}"),
            ),
        ]
    )

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
                    device_list,
                ],
                spacing=0,
            ),
            padding=ft.padding.symmetric(vertical=10),
        )
    )

    main_content.controls = [content]
    page.update()
