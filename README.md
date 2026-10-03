# 🗑️ Trash Card Plus

A Lovelace card for Home Assistant that shows your next **waste collection dates from your
calendar** – and lets **every waste type have its own design**: its own colors, transparency,
background, border, icon shape and highlight. Everything is configured in a clean visual
editor, no YAML required.

![Trash Card Plus – light and dark](images/hero.png)

> Based on the excellent [TrashCard](https://github.com/idaho/hassio-trash-card) by
> [@idaho](https://github.com/idaho). The calendar logic was taken over, the rendering and the
> editor were completely rewritten.

## ✨ Features

- **Every waste type can be styled individually** – background (theme, tint, solid color, custom color, transparent),
  opacity slider, gradient, icon color, icon background and shape, text color, border, shadow, highlight.
  Anything you don't override comes from the shared default design.
- **Transparency & glass effect** – opacity sliders for the entries and the surrounding card, plus backdrop blur.
- **Simple date format** – instead of cryptic format codes you pick from a list with real examples
  ("Thu, 10/01", "Thursday, October 1", "in 3 days" …) or build your own format with dropdowns.
  A live preview instantly shows what today / tomorrow / in 5 days look like.
- **4 layouts**: tiles (icon left or on top), list, chips, icons with countdown
- **Countdown badge** ("3 days") or countdown as a separate line
- **Highlight** for today (or today + tomorrow): glow, pulse, colored border or slightly larger –
  later dates can optionally be shown fainter
- **Tabbed editor** (Calendar · Display · Date · Design · Waste types) with a live preview of every waste type
- **"Events found in calendar"** – the editor shows which calendar entries it recognizes and turns
  unrecognized ones (e.g. "Hazardous waste collection") into a new waste type with one click
- **Multiple search terms** per waste type ("residual, grey")
- **Catch-all waste type** for everything that matches no search term – it then shows the real calendar title
- **Same design system as EV Charge Card, Radial Flow Card and Status Summary Card** – same options,
  same names, same YAML keys
- English & German, light and dark theme, sections dashboard
- Accepts YAML configurations of the original TrashCard (`pattern:` is converted automatically)

## 🖼️ Examples

| | |
|---|---|
| **Bold** – solid color with gradient, icon on top, pulse | **Every waste type different** |
| ![Bold](images/bold-light.png) | ![Individual](images/individual-light.png) |
| **List** inside one card | **Chips** |
| ![List](images/list-light.png) | ![Chips](images/chips-light.png) |
| **Icons** with countdown | **Dark theme** |
| ![Icons](images/icons-light.png) | ![Dark](images/individual-dark.png) |

## 🎛️ The editor

| Date – with live preview | Design – default for all waste types |
|---|---|
| ![Editor date](images/editor-date.png) | ![Editor design](images/editor-design.png) |
| **Waste types** – including events found in the calendar | **Editing a waste type** – with its own preview |
| ![Editor waste types](images/editor-items.png) | ![Editor waste type](images/editor-item.png) |

## 📦 Installation

### Via HACS (recommended)

The card is not (yet) listed in the official HACS store, but can be added as a
**custom repository**:

1. Open HACS → **⋮** (top right) → **Custom repositories**
2. Repository URL: `https://github.com/Kohle93/Trash-Card-Plus`
3. Type: **Dashboard**
4. **Add** → search for the card in the list → **Download**
5. Reload your browser (clear the cache if necessary)

### Manual

1. Download [`trash-card-plus.js`](trash-card-plus.js) and copy it to `/config/www/`
2. Settings → Dashboards → ⋮ → **Resources** → Add resource
   - URL: `/local/trash-card-plus.js`
   - Type: **JavaScript module**
3. Reload your browser

## 🧩 Requirement: a calendar

The dates come from any **calendar entity** – e.g. the
[local calendar](https://www.home-assistant.io/integrations/local_calendar/), an
ICS/CalDAV calendar or the [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule) integration.
The title of each event (e.g. "Residual waste bin") is compared with the search terms of your waste types.

## ⚙️ Usage

Edit your dashboard → **Add card** → **Trash Card Plus**. The card automatically picks a matching
calendar and comes with default waste types (residual waste, organic, paper, recycling, other).
As long as there are no dates yet, the preview shows sample dates so you can set up the design right away.

### Minimal

```yaml
type: custom:trash-card-plus
entities:
  - calendar.waste_collection
```

### Bold tiles with gradient

```yaml
type: custom:trash-card-plus
entities:
  - calendar.waste_collection
orientation: vertical
columns: 3
max_items: 3
bg_mode: accent
bg_opacity: 100
bg_gradient: true
icon_bg_mode: none
icon_size: 30
highlight: pulse
highlight_days: 1
```

### Glass card with list

![Glass effect](images/glass.png)

```yaml
type: custom:trash-card-plus
entities:
  - calendar.waste_collection
layout: list
container: card
title: Waste collection
title_icon: mdi:trash-can-outline
card_bg_opacity: 40
card_blur: 12
bg_mode: none
shadow: none
date_format: weekday_long_date
```

### Every waste type with its own design

```yaml
type: custom:trash-card-plus
entities:
  - calendar.waste_collection
columns: 2
countdown: line
items:
  - label: Residual waste
    pattern: residual, grey
    icon: mdi:trash-can
    color: [97, 97, 97]
    bg_mode: custom
    bg_color: [38, 50, 56]
    bg_opacity: 100
  - label: Organic
    pattern: organic, bio
    icon: mdi:leaf
    color: [76, 175, 80]
    bg_mode: accent
    bg_opacity: 100
    bg_gradient: true
    icon_shape: rounded
    highlight: pulse
  - label: Paper
    pattern: paper, blue
    icon: mdi:newspaper-variant-outline
    color: [33, 150, 243]
    bg_mode: theme
    border_mode: accent
    border_width: 2
  - label: Recycling
    pattern: recycl, plastic
    icon: mdi:recycle
    color: "#ffc107"
    bg_opacity: 35
  - label: Other
    icon: mdi:dump-truck
    color: purple
    fallback: true
```

## 📖 All options

Everything can be set in the editor – the tables are just for reference.

### Calendar

| Option | Default | Description |
|---|---|---|
| `entities` | – | List of calendar entities |
| `next_days` | `14` | How many days to look ahead |
| `max_items` | all | Maximum number of entries |
| `event_grouping` | `true` | Only show the next date per waste type |
| `filter_events` | `false` | Only show recognized waste types (no catch-all) |
| `only_all_day_events` | `false` | Ignore events with a time |
| `location` | – | Only events whose location contains this text |
| `drop_todayevents_from` | `10:00:00` | From this time on, today's all-day events disappear |
| `refresh_rate` | `60` | Reload the calendar every x minutes |
| `hide_when_empty` | `true` | Hide the card when nothing is due (otherwise `empty_text`) |

### Display

| Option | Default | Values |
|---|---|---|
| `layout` | `tiles` | `tiles`, `list`, `chips`, `icons` |
| `orientation` | `horizontal` | `horizontal`, `vertical` (tiles only) |
| `columns` | `2` | Columns for tiles/icons |
| `alignment` | `left` | `left`, `center`, `right`, `space` (chips) |
| `show_label` / `use_summary` | `true` / `false` | Show label / use the calendar title instead of the label |
| `title`, `title_icon` | – | Card title |
| `tap_action` | `more-info` | Any HA action |

### Date

| Option | Default | Values |
|---|---|---|
| `date_format` | `smart` | `smart`, `weekday_date`, `weekday_long_date`, `date_short`, `date_numeric`, `date_medium`, `date_long`, `weekday_long`, `weekday_short`, `countdown`, `weekday_countdown`, `custom` |
| `df_weekday` / `df_day` / `df_month` / `df_year` | `short` / `2-digit` / `2-digit` / `none` | Building blocks for `custom` (`none`, `short`, `long`, `numeric`, `2-digit`) |
| `relative_words` | `today_tomorrow` | `none`, `today_tomorrow`, `all` (incl. day after tomorrow) |
| `countdown` | `badge` | `none`, `badge`, `line` |
| `show_time` | `true` | Show the time for events with a time |

### Design (global and per waste type)

These options apply to all waste types and can be overridden in each entry under `items`.
Colors can be given as `[r, g, b]`, hex code (`"#ff9800"`) or HA color name (`red`, `deep-purple` …).

#### Surrounding card (same as EV Charge Card, Radial Flow Card and Status Summary Card)

At the very top of the **Design** tab in the editor – same options, names and YAML keys
as in the other cards, so design YAML can be copied between the cards.

| Option | Default | Values |
|---|---|---|
| `container` | `none` | `none` (separate entries) or `card` (all entries in one card) |
| `accent_color` | theme accent | Color for `tinted`, `accent` and the accent border of the card |
| `card_bg_mode` | `theme` | `theme`, `tinted` (theme + tint), `accent`, `custom`, `none` |
| `card_bg_color`, `card_bg_opacity`, `card_bg_gradient` | – / `100` / `false` | Custom color, opacity (%), gradient |
| `card_blur` | `0` | Blur behind the card (px, glass effect) |
| `card_border_mode` | `theme` | `theme`, `none`, `accent`, `custom` (+ `card_border_color`, `card_border_width`) |
| `card_shadow` | `theme` | `theme`, `none`, `soft`, `strong` |
| `card_radius`, `card_padding` | theme / same as `padding` | Corner radius and padding of the card (px) |

The previous keys `container_bg_mode`, `container_bg_color`, `container_bg_opacity`
and `container_blur` keep working and are migrated automatically.

#### Waste types

| Option | Default | Values |
|---|---|---|
| `bg_mode` | `tinted` | `theme`, `tinted` (theme + tint), `accent`, `custom`, `none` |
| `bg_color`, `bg_opacity`, `bg_gradient` | – / `18` / `false` | Custom color, opacity or tint strength (%), gradient |
| `icon_color_mode`, `icon_color` | `auto` | `auto`, `accent`, `text`, `custom` |
| `icon_bg_mode`, `icon_bg_color`, `icon_bg_opacity` | `accent` / – / `20` | `none`, `accent`, `theme`, `custom` |
| `icon_shape` | `circle` | `circle`, `rounded`, `square` |
| `text_color_mode`, `text_color` | `auto` | `auto` (contrast), `theme`, `custom` |
| `border_mode`, `border_color`, `border_width` | `none` / – / `1` | `none`, `accent`, `theme`, `custom` |
| `shadow` | `theme` | `theme`, `none`, `soft`, `strong` |
| `highlight` | `glow` | `none`, `glow`, `pulse`, `border`, `scale` |

Global only: `blur`, `icon_size`, `label_size`, `date_size`, `countdown_size`, `radius`, `padding`, `gap`,
`highlight_days` (`0` = today only, `1` = today + tomorrow), `future_opacity`.

### Waste types (`items`)

| Option | Description |
|---|---|
| `label` | Display name |
| `pattern` | Search term(s) in the calendar title, separated by commas |
| `pattern_exact` | Title must match exactly |
| `icon` / `picture` | MDI icon or image URL (e.g. `/local/bin.png`) |
| `color` | Color of the waste type |
| `fallback` | Catch-all for all unrecognized events |
| `hidden` | Don't show this waste type |

## 🙏 Credits & license

- Original idea and calendar logic: [TrashCard](https://github.com/idaho/hassio-trash-card) by Florian Triebel (@idaho)
- License: [Apache License 2.0](LICENSE) – see also [NOTICE](NOTICE)
