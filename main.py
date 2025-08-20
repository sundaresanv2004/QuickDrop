import flet as ft

from src.functions import theme, navigation_bar
from src.pages.explore import explore_page


async def main(page: ft.Page):
    page.title = "Quick Drop"
    page.window.center()
    page.window.maximized = True

    async def window_event(e):
        if e.data == "close":
            nm = page.session.get("network_manager")
            if nm:
                await nm.stop_async()
            page.window.destroy()

    page.on_window_event = window_event

    theme.set_theme(page)

    main_content = ft.Column(
        scroll=ft.ScrollMode.ADAPTIVE,
        expand=True
    )

    page.navigation_bar = navigation_bar.set_navigation_bar(page, main_content)

    page.add(
        ft.SafeArea(
            main_content,
            expand=True,
        )
    )

    await explore_page(page, main_content)


if __name__ == "__main__":
    ft.app(
        target=main,
        assets_dir="src/assets"
    )