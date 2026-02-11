# DiscordLiveServerStatus

A SquadJS plugin that displays a **live-updating server status embed** in a Discord channel. The embed automatically refreshes every few seconds and shows real-time server information including TPS, player counts, squad counts, queue status, team compositions with faction emojis, the current map image, gamemode, and an **"Active Admins"** button.

## Features

- **Live TPS indicator** with color-coded emoji (🟢 ≥35, 🟡 ≥20, 🔴 <20)
- **Player & squad counts** for the entire server and per-team breakdown
- **Queue information** (public queue + whitelist/reserved slots)
- **Team names** resolved from RCON `ShowServerInfo`, layer metadata, or Layers database — automatically cleaned (e.g. `IMF_LO_Mechanized` → `IMF Mechanized`)
- **Faction emojis** next to team names, resolved from the bot's Discord emoji cache
- **Current map image** loaded from the local `maps/` folder
- **Gamemode display** (RAAS, AAS, Invasion, etc.)
- **"Active Admins" button** — clicking it shows a private (ephemeral) list of online admins, visible only to the person who clicked
- **Bot presence** showing current player count and layer name
- **Full localization** — every single display string can be translated via config
- **Custom faction emojis** — override any faction emoji ID without touching the code

---

## Installation

### 1. Place the Plugin File

Copy `discord-live-server-status.js` into your SquadJS `squad-server/plugins/` directory.

### 2. Add Map Images

Place maps file in the `squad-server/plugins/maps/` directory.

### 3. Upload Custom Faction Emojis

Upload faction flag/icon emojis to your Discord server. The plugin ships with default emoji IDs, but you'll need to either:
- Upload your own emojis and override the IDs in config (see [Custom Faction Emojis](#custom-faction-emojis))

### 4. Configure in `config.json`

Add the following entry to the `plugins` array in your `config.json`:

### 5. Restart SquadJS

Restart your SquadJS instance. The bot will post a new embed in the configured channel and begin updating it automatically.

---

## Configuration Options

| Option | Required | Default | Description |
|---|---|---|---|
| `discordClient` | ✅ | `"discord"` | The name of the Discord connector defined in your connectors config. |
| `channelID` | ✅ | `""` | The Discord channel ID where the status embed will be posted. |
| `updateInterval` | ❌ | `5000` | How often the embed refreshes, in milliseconds. Default is 5 seconds. |
| `embedColor` | ❌ | `"#bf0000"` | The color of the embed sidebar, in hex format. |
| `setBotStatus` | ❌ | `true` | Whether to update the bot's Discord presence with the current player count and layer name. |
| `factionEmojiOverrides` | ❌ | `{}` | Override default faction emoji IDs. See [Custom Faction Emojis](#custom-faction-emojis). |
| `strings` | ❌ | *(Turkish)* | All display strings. Override to translate to any language. See [Localization](#localization). |

---

## Localization

Every piece of text displayed in the embed is configurable through the `strings` object in your config. This makes it trivial to translate the plugin to any language — **no code changes required**.

### Default Strings (English)

### Translation

```json
"strings": {
  "title": "📊 Live Server Status", // Change it in your language
  "matchStarted": "Match started **{time}** ago", // Change it in your language
  "tps": "TPS", 
  "playerAndSquad": "Players & Squads", // Change it in your language
  "queue": "Queue", // Change it in your language
  "player": "Player", // Change it in your language
  "squad": "Squad", // Change it in your language
  "publicQueue": "Public Queue", // Change it in your language
  "whitelist": "Whitelist", // Change it in your language
  "map": "Map", // Change it in your language
  "gamemode": "Mode", // Change it in your language
  "activeAdminsButton": "Active Admins", // Change it in your language
  "activeAdminsTitle": "Active Admin List", // Change it in your language
  "noActiveAdmins": "No active admins at this time.", // Change it in your language
  "interactionError": "An error occurred.", // Change it in your language
  "minutes": "minutes", // Change it in your language
  "hours": "hours", // Change it in your language
  "days": "days", // Change it in your language
  "unknown": "Unknown" // Change it in your language
}
```
## Custom Faction Emojis

The plugin ships with default custom Discord emoji IDs for all Squad factions. If you need to use your own emojis (e.g. on a different Discord server), override them via the `factionEmojiOverrides` config option.

### Supported Faction Codes

| Code | Faction | Code | Faction |
|---|---|---|---|
| `usa` | United States Army | `rgf` | Russian Ground Forces |
| `usmc` | US Marine Corps | `vdv` | Russian Airborne |
| `baf` | British Armed Forces | `pla` | People's Liberation Army |
| `caf` | Canadian Armed Forces | `plaagf` | PLA Amphibious Ground Force |
| `adf` | Australian Defence Force | `planmc` | PLA Naval Marine Corps |
| `tlf` | Turkish Land Forces | `mei` | Middle Eastern Insurgents |
| `imf` | Irregular Militia Forces | `wpmc` | Western PMC |
| `ins` | Insurgents | `gfio` | GFIO |
| `afou` | AFOU | `crf` | CRF |

### Example: Override Specific Emojis

```json
"factionEmojiOverrides": {
  "usa": "<:usa_flag:1234567890123456789>",
  "rgf": "<:russia:9876543210987654321>",
  "caf": "<:canada:1111111111111111111>"
}
```

### How Emoji Resolution Works

1. The plugin merges your overrides with the default emoji map
2. For each emoji, it tries to resolve the emoji from the bot's **Discord emoji cache** by ID
3. If not found by ID, it tries to find it by name
4. If the emoji can't be resolved from cache, the raw `<:name:id>` string is used as-is
5. When displaying team names, the plugin matches faction codes and team name keywords against the emoji map

---

## How Team Names Are Resolved

The plugin uses a multi-tier resolution strategy to get accurate team names:

| Priority | Source | Example Output |
|---|---|---|
| 1 | RCON `ShowServerInfo` (`TeamOne_s` / `TeamTwo_s`) | `49th Combined Arms Army` |
| 2 | Layer metadata (`teams[].name` / `teams[].faction`) | `IMF_LO_Mechanized` |
| 3 | Layers database lookup | `Canadian Armed Forces` |
| 4 | Fallback | `Team 1` / `Team 2` |

After resolution, names are automatically **cleaned**:
- Underscores (`_`) are replaced with spaces
- Layer variant abbreviations (`LO`, `HI`, `MID`, `INF`, `LIGHT`, `HEAVY`) are removed

**Examples:**
| Raw Name | Displayed As |
|---|---|
| `IMF_LO_Mechanized` | `IMF Mechanized` |
| `TLF_LO_Mechanized` | `TLF Mechanized` |
| `CAF_HI_Armored` | `CAF Armored` |
| `RGF_Combined_Arms` | `RGF Combined Arms` |

---

## Active Admins Button

The embed includes a red **"Active Admins"** button at the bottom. When a user clicks it:

1. The plugin collects all online players who are admins (via `server.admins` and `getAdminsWithPermission('canseeadminchat')`)
2. It sends an **ephemeral response** (private, only visible to the user who clicked) with the list of active admin names
3. If no admins are online, it shows the `noActiveAdmins` message

This keeps admin information private while still being easily accessible.

---

## How It Works

1. On startup, the plugin fetches the configured Discord channel and searches for an existing bot message to edit
2. Every `updateInterval` milliseconds (default: 5 seconds), it:
   - Builds a new embed with the latest server data
   - If the map changed, deletes the old message and sends a new one (to update the map image)
   - If the map is the same, edits the existing message in-place (no new message spam)
3. The bot's Discord presence is updated with the current player count and layer name
4. Button interactions are handled via the `interactionCreate` event listener

---

## Requirements

- **SquadJS 4.1.0+**
- **discord.js v14** (uses `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`, `ButtonStyle`)
- A Discord bot with permissions to:
  - Send messages in the target channel
  - Embed links
  - Attach files
  - Use application commands (for button interactions)

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Embed not showing | Make sure you're using discord.js v14. The plugin uses `EmbedBuilder` and `{ embeds: [...] }` format. |
| Faction emojis showing as text | The bot doesn't have access to those emojis. Upload them to a server the bot is in, then override the IDs in `factionEmojiOverrides`. |
| Map image not showing | Make sure the map PNG file exists in `squad-server/plugins/maps/` with the correct lowercase name (e.g., `narva.png`). |
| Team names showing raw codes | The RCON `ShowServerInfo` command may not be returning data. The plugin will fall back to layer metadata, which gets cleaned automatically. |
| Button not responding | Make sure the bot has the "Use Application Commands" permission in the channel. |
| `SyntaxError: does not provide an export named 'default'` | Make sure the import uses `{ Layers }` (named export), not `Layers` (default export). |
