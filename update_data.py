import datetime
import json
import os

import aiohttp
import asyncio

from environs import Env

from bs4 import BeautifulSoup
from github import Github, GithubException

env = Env()
DATA_FILE = env.str("DATA_FILE", default="data/venue-menu-history.json")
GITHUB_TOKEN = env.str("GITHUB_TOKEN")
PRIVATE_REPO = env.str("PRIVATE_REPO", default="dontyouknowimlocal/toodamnstrong")
VENUES = tuple(env.json("VENUES"))


async def is_duplicate(existing_data, today, venue):
    return any(
        entry["venue_id"] == venue["id"] and entry["date"] == today
        for entry in existing_data
    )


async def fetch_page(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()
            return await response.text()


def parse_beer_info(beer_item):
    rating_text = beer_item.select_one("h6 .num").text.strip("()")
    rating = float(rating_text) if rating_text != "N/A" else None

    return {
        "name": beer_item.select_one("h5 a").text.strip(),
        "style": beer_item.select_one("h5 em").text.strip(),
        "abv": beer_item.select_one("h6 span")
        .text.split("•")[0]
        .strip()
        .replace("% ABV", ""),
        "brewery": beer_item.select_one("h6 span a").text.strip(),
        "brewery_url": beer_item.select_one("h6 span a")["href"],
        "rating": rating,
    }


async def get_beer_info(url):
    page_content = await fetch_page(url)
    soup = BeautifulSoup(page_content, "html.parser")
    beers = soup.select(".menu-item")
    return [parse_beer_info(beer) for beer in beers]


async def update_beer_data(venues, existing_data):
    data = []
    for venue in venues:
        today = datetime.date.today().isoformat()

        if await is_duplicate(existing_data, today, venue):
            continue

        url = (
            f"https://untappd.com/v/the-hive-craft-beer-and-coffee-shop/{venue['id']}/"
        )
        beers = await get_beer_info(url)
        valid_beers = [beer for beer in beers if beer["rating"] is not None]

        if not valid_beers:
            continue

        data.append(
            {
                "venue_id": venue["id"],
                "venue_name": venue["name"],
                "date": today,
                "abv_avg": sum(float(beer["abv"]) for beer in valid_beers)
                / len(valid_beers),
                "abv_max": max(float(beer["abv"]) for beer in valid_beers),
                "abv_min": min(float(beer["abv"]) for beer in valid_beers),
                "rating_avg": sum(beer["rating"] for beer in valid_beers)
                / len(valid_beers),
                "rating_max": max(beer["rating"] for beer in valid_beers),
                "rating_min": min(beer["rating"] for beer in valid_beers),
                "beers": valid_beers,
            }
        )
    return data


def load_existing_data(file_path):
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            return json.load(f)
    return []


def save_data_to_file(data, file_path):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(data, f, indent=4)


def get_repo(github_instance, repo_name):
    try:
        return github_instance.get_repo(repo_name)
    except GithubException as e:
        raise RuntimeError(f"Failed to access repository: {e}")


def get_file_contents(repo, file_path):
    try:
        return repo.get_contents(file_path)
    except GithubException:
        return None


def update_file(repo, file_path, data, commit_message):
    try:
        contents = repo.get_contents(file_path)
        repo.update_file(contents.path, commit_message, data, contents.sha)
    except GithubException:
        repo.create_file(file_path, commit_message, data)


async def main():
    github = Github(GITHUB_TOKEN)
    repo = get_repo(github, PRIVATE_REPO)

    existing_data = load_existing_data(DATA_FILE)
    new_data = await update_beer_data(VENUES, existing_data)
    all_data = existing_data + new_data
    save_data_to_file(all_data, DATA_FILE)

    with open(DATA_FILE, "r") as file:
        file_data = file.read()
    commit_message = "Update beer data"
    update_file(repo, DATA_FILE, file_data, commit_message)


if __name__ == "__main__":
    asyncio.run(main())
