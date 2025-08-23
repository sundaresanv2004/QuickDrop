import flet as ft

THEME_KEY = "theme_mode"


async def set_theme(page: ft.Page) -> None:
    saved_theme = await page.client_storage.get_async(THEME_KEY)

    if saved_theme == "light":
        page.theme_mode = ft.ThemeMode.LIGHT
    else:
        page.theme_mode = ft.ThemeMode.DARK

    page.theme = ft.Theme(color_scheme_seed='indigo')
    page.update()


async def update_theme(e, page: ft.Page) -> None:
    """
    Updates the theme based on the switch control's value and saves the
    preference to client storage.
    """
    new_theme_mode = ft.ThemeMode.DARK if e.control.value else ft.ThemeMode.LIGHT
    page.theme_mode = new_theme_mode

    await page.client_storage.set_async(THEME_KEY, new_theme_mode.value)

    page.update()
