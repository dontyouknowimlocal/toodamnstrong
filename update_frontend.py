import pandas as pd
import hvplot.pandas  # For HoloViews interactive plots
import holoviews as hv  
import json

# Ensure we use the Bokeh backend
hv.extension('bokeh')

# Load data from JSON file
with open("data/venue-menu-history.json", "r") as file:
    data = json.load(file)

# Convert JSON data into a DataFrame
records = []
for entry in data:
    for beer in entry["beers"]:
        records.append({
            "venue": entry["venue_name"],
            "date": entry["date"],
            "abv_avg": entry["abv_avg"],
            "abv_max": entry["abv_max"],
            "abv_min": entry["abv_min"],
            "rating_avg": entry["rating_avg"],
            "rating_max": entry["rating_max"],
            "rating_min": entry["rating_min"],
            "beer_name": beer["name"],
            "beer_style": beer["style"],
            "beer_abv": float(beer["abv"]),
            "beer_rating": beer["rating"]
        })

# Create DataFrame
df = pd.DataFrame(records)

# Generate interactive plots
abv_plot = df.hvplot.line(x="date", y=["abv_min", "abv_avg", "abv_max"], by="venue", title="Min/Avg/Max ABV Over Time")
rating_plot = df.hvplot.line(x="date", y=["rating_min", "rating_avg", "rating_max"], by="venue", title="Min/Avg/Max Rating Over Time")

# Save interactive plots as standalone HTML files
hv.save(abv_plot, "abv_plot.html", fmt="html")
hv.save(rating_plot, "rating_plot.html", fmt="html")

# Generate static table
table_html = df.to_html(classes='table table-striped', index=False)

# Create HTML page
html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brewery Data Dashboard</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body class="container">
    <h1 class="mt-4">Brewery Data Dashboard</h1>
    <h2 class="mt-4">ABV Trends</h2>
    <iframe src="abv_plot.html" width="100%" height="500px" frameborder="0"></iframe>
    <h2 class="mt-4">Rating Trends</h2>
    <iframe src="rating_plot.html" width="100%" height="500px" frameborder="0"></iframe>
    <h2 class="mt-4">Beer Table</h2>
    <div class="table-responsive">{table_html}</div>
</body>
</html>
"""

# Save as static HTML
with open("index.html", "w") as file:
    file.write(html_content)
