import flet as ft



def set_navigation_bar(page: ft.Page) -> ft.NavigationBar:

    async def on_option(e) -> None:
        selected_index = e.data

        if selected_index == '0':
            page.go('/')
        elif selected_index == '1':
            page.go('/settings')


    return ft.NavigationBar(
        selected_index=0,
        destinations=[
            ft.NavigationBarDestination(
                icon=ft.Icons.EXPLORE_OUTLINED,
                selected_icon=ft.Icons.EXPLORE,
                label="Explore",
            ),
            ft.NavigationBarDestination(
                icon=ft.Icons.SETTINGS_OUTLINED,
                selected_icon=ft.Icons.SETTINGS,
                label="Settings",
            ),
        ],
        on_change=on_option
    )
