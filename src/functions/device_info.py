import flet as ft
import random

ADJECTIVES = [
    "Red", "Blue", "Green", "Happy", "Swift", "Silent", "Brave", "Clever",
    "Flying", "Jumping", "Running", "Ancient", "Modern", "Cosmic", "Aqua"
]
NOUNS = [
    "Fox", "Lion", "Tiger", "Robot", "Planet", "Star", "Comet", "River",
    "Mountain", "Eagle", "Phone", "Laptop", "Server", "Panda", "Beacon"
]

def _generate_random_name() -> str:
    adj = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    return f"{adj} {noun}"

async def get_device_name(page: ft.Page) -> str:
    device_name = await page.client_storage.get_async("device_name")
    if not device_name:
        device_name = _generate_random_name()
        await page.client_storage.set_async("device_name", device_name)
    return device_name
