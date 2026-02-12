import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import BasePlugin from './base-plugin.js';
import { COPYRIGHT_MESSAGE } from '../utils/constants.js';
import { Layers } from '../layers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_FACTION_EMOJIS = {
  afou: '<:afou:1462308263654592574>',
  adf: '<:adf:1462308180208910501>',
  aus: '<:adf:1462308180208910501>',
  baf: '<:baf:1462308128457030677>',
  gb: '<:baf:1462308128457030677>',
  caf: '<:caf:1457180212977471498>',
  usa: '<:usa:1457180398793654408>',
  us: '<:usa:1457180398793654408>',
  usmc: '<:usmc:1457180418976645160>',
  pla: '<:pla:1457180304593911860>',
  plaagf: '<:plaafg:1457180190009462846>',
  planmc: '<:planmc:1457180327515783293>',
  vdv: '<:vdv:1457180137308295416>',
  rgf: '<:rgf:1457180354073989163>',
  rus: '<:rgf:1457180354073989163>',
  gfio: '<:gfio:1462308301550391469>',
  tlf: '<:tlf:1457180375666397225>',
  mei: '<:mei:1462309002666049623>',
  mea: '<:mei:1462309002666049623>',
  imf: '<:imf:1462308964443357205>',
  ins: '<:imf:1462308964443357205>',
  mil: '<:imf:1462308964443357205>',
  wpmc: '<:wpmc:1457180163849588935>',
  crf: '<:crf:1462308335939489846>'
};

const FACTION_SYNONYMS = {
  canadian: 'caf',
  canada: 'caf',
  british: 'baf',
  russian: 'rgf',
  militia: 'wpmc',
  insurgent: 'imf',
  insurgents: 'imf',
  marines: 'usmc',
  chinese: 'pla',
  australian: 'adf',
  turkish: 'tlf',
  middle: 'mei',
  combined: 'rgf',
  eastern: 'mei',
  mechanized: 'caf'
};

export default class DiscordLiveServerStatus extends BasePlugin {
  // ───────────────────── Meta ─────────────────────
  static get description() {
    return (
      'Displays a live-updating server status embed in a Discord channel. ' +
      'Shows TPS, player/squad counts, queue info, team details with faction emojis, ' +
      'current map with image, gamemode, and an "Aktif Adminler" button. ' +
      'All text strings are configurable for easy localization to any language.'
    );
  }

  static get defaultEnabled() {
    return true;
  }

  // ───────────────────── Options ─────────────────────
  static get optionsSpecification() {
    return {
      discordClient: {
        required: true,
        description: 'Discord connector name.',
        connector: 'discord',
        default: 'discord'
      },

      channelID: {
        required: true,
        description: 'The ID of the Discord channel to post the status embed.',
        default: '',
        example: '1234567890123456789'
      },

      updateInterval: {
        required: false,
        description: 'How frequently to update the embed (ms).',
        default: 5 * 1000
      },

      embedColor: {
        required: false,
        description: 'Embed side-bar color in hex.',
        default: '#bf0000'
      },

      setBotStatus: {
        required: false,
        description: "Whether to update the bot's Discord presence with player count.",
        default: true
      },

      factionEmojiOverrides: {
        required: false,
        description:
          'Override default faction emoji IDs. Keys are lowercase faction codes, values are Discord emoji strings like <:name:id>.',
        default: {}
      },

      strings: {
        required: false,
        description:
          'All display strings. Override this object in config to translate to any language.',
        default: {
          title: '📊 Anlık Sunucu Verileri',
          matchStarted: 'Maç **{time}** önce başladı',
          tps: 'TPS',
          playerAndSquad: 'Oyuncu & Manga',
          queue: 'Sıra',
          player: 'Oyuncu',
          squad: 'Manga',
          publicQueue: 'Public Sıra',
          whitelist: 'Whitelist',
          map: 'Harita',
          gamemode: 'Mod',
          activeAdminsButton: 'Aktif Adminler',
          activeAdminsTitle: 'Aktif Admin Listesi',
          noActiveAdmins: 'Şu anda aktif admin bulunmamaktadır.',
          interactionError: 'Bir hata oluştu.',
          minutes: 'dakika',
          hours: 'saat',
          days: 'gün',
          unknown: 'Bilinmiyor'
        }
      }
    };
  }

  // ───────────────────── Constructor ─────────────────────
  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.tickRate = null;
    this.statusMessage = null;
    this.lastMapKey = null;
    this.channel = null;
    this.resolvedEmojiMap = {};
    this.cachedRconInfo = null;
    this._updating = false;
    this._lastSendTime = 0;

    this.updateEmbed = this.updateEmbed.bind(this);
    this.updateBotStatus = this.updateBotStatus.bind(this);
    this.onInteraction = this.onInteraction.bind(this);
  }

  // ───────────────────── Lifecycle ─────────────────────
  async prepareToMount() {
    try {
      this.channel = await this.options.discordClient.channels.fetch(this.options.channelID);
    } catch (err) {
      this.verbose(1, `Could not fetch channel ${this.options.channelID}: ${err.message}`);
    }
  }

  async mount() {
    this.buildEmojiMap();

    this.server.on('TICK_RATE', (data) => {
      this.tickRate = data.tickRate;
    });

    await this.findExistingMessage();

    await this.updateEmbed();

    this.updateTimer = setInterval(this.updateEmbed, this.options.updateInterval);

    try {
      this.options.discordClient.on('interactionCreate', this.onInteraction);
    } catch (e) {
      this.verbose(1, `Failed to register interaction handler: ${e.message}`);
    }

    if (this.options.setBotStatus) {
      this.updateBotStatus();
      this.statusTimer = setInterval(this.updateBotStatus, this.options.updateInterval);
    }
  }

  async unmount() {
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    try {
      this.options.discordClient.removeListener('interactionCreate', this.onInteraction);
    } catch (_) {
    }
  }

  // ───────────────────── Emoji Resolution ─────────────────────

  buildEmojiMap() {
    const merged = { ...DEFAULT_FACTION_EMOJIS, ...(this.options.factionEmojiOverrides || {}) };

    const cache = this.options.discordClient?.emojis?.cache;

    for (const [key, rawValue] of Object.entries(merged)) {
      if (!rawValue || typeof rawValue !== 'string') {
        this.resolvedEmojiMap[key] = '';
        continue;
      }

      const val = rawValue.trim();

      if (cache) {
        const idMatch = val.match(/:(\d{17,20})>/);
        if (idMatch) {
          const found = cache.get(idMatch[1]);
          if (found) {
            this.resolvedEmojiMap[key] = found.toString();
            continue;
          }
        }

        const nameMatch = val.match(/:(\w+):/);
        if (nameMatch) {
          const name = nameMatch[1];
          const found =
            cache.find((e) => e.name === name) ||
            cache.find((e) => e.name?.toLowerCase() === name.toLowerCase());
          if (found) {
            this.resolvedEmojiMap[key] = found.toString();
            continue;
          }
        }
      }

      this.resolvedEmojiMap[key] = val;
    }

    this.verbose(1, `Resolved ${Object.keys(this.resolvedEmojiMap).length} faction emojis.`);
  }

  resolveEmojiForTeam(teamName, factionCode) {
    if (!teamName && !factionCode) return '';

    if (factionCode) {
      const code = factionCode.toLowerCase();
      if (this.resolvedEmojiMap[code]) return this.resolvedEmojiMap[code];
    }

    if (teamName) {
      const cleaned = teamName
        .replace(/^FSTemplate[_ ]*/i, '')
        .replace(/_/g, ' ')
        .trim();

      const tokens = cleaned.toLowerCase().split(/[\s_-]+/).filter(Boolean);

      const keys = Object.keys(this.resolvedEmojiMap)
        .filter((k) => this.resolvedEmojiMap[k])
        .sort((a, b) => b.length - a.length);

      for (const key of keys) {
        if (tokens.some((t) => t === key)) return this.resolvedEmojiMap[key];
      }

      for (const [synonym, mapKey] of Object.entries(FACTION_SYNONYMS)) {
        if (tokens.some((t) => t === synonym) && this.resolvedEmojiMap[mapKey]) {
          return this.resolvedEmojiMap[mapKey];
        }
      }

      for (const key of keys) {
        if (tokens.some((t) => t.length >= 3 && t.startsWith(key) && key.length >= 3)) {
          return this.resolvedEmojiMap[key];
        }
      }
    }

    return '';
  }

  // ───────────────────── Helpers ─────────────────────

  async findExistingMessage() {
    if (!this.channel) return;
    try {
      const messages = await this.channel.messages.fetch({ limit: 50 });
      const botId = this.options.discordClient.user.id;

      const botMsg = messages.find(
        (m) => m.author.id === botId && m.embeds.length > 0
      );

      if (botMsg) {
        this.statusMessage = botMsg;
        this.lastMapKey = this.getMapImageKey();
        this.verbose(1, `Found existing status message (ID: ${botMsg.id}) – will edit it.`);
      } else {
        this.verbose(1, 'No existing status message found – will create a new one.');
      }
    } catch (err) {
      this.verbose(1, `Could not search existing messages: ${err.message}`);
    }
  }

  getMapImageKey() {
    const mapName = this.server.currentLayer?.map?.name || '';
    if (mapName) return mapName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const rconLayer = this.cachedRconInfo?.MapName_s;
    if (rconLayer) {
      const parsed = this.parseLayerClassname(rconLayer);
      if (parsed.mapName) return parsed.mapName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    return '';
  }

  getMapImagePath() {
    const key = this.getMapImageKey();
    if (!key) return null;

    const exactPath = path.join(__dirname, 'maps', `${key}.png`);
    if (fs.existsSync(exactPath)) return exactPath;

    try {
      const mapsDir = path.join(__dirname, 'maps');
      if (!fs.existsSync(mapsDir)) return null;
      const files = fs.readdirSync(mapsDir).filter((f) => f.endsWith('.png'));

      const match = files.find((f) => {
        const fname = f.replace('.png', '').toLowerCase();
        return fname === key || key.includes(fname) || fname.includes(key);
      });

      if (match) {
        this.verbose(2, `Map image fuzzy matched: '${key}' → '${match}'`);
        return path.join(mapsDir, match);
      }
    } catch (_) {
      /* ignore */
    }

    this.verbose(2, `No map image found for key: '${key}'`);
    return null;
  }

  getTimeAgo(startTime) {
    const s = this.options.strings;
    if (!startTime) return s.unknown;

    const diff = Date.now() - new Date(startTime).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} ${s.days} ${hours % 24} ${s.hours}`;
    if (hours > 0) return `${hours} ${s.hours} ${minutes % 60} ${s.minutes}`;
    return `${minutes} ${s.minutes}`;
  }

  getTpsEmoji(tps) {
    if (tps === null || tps === undefined) return '⚫';
    if (tps >= 35) return '🟢';
    if (tps >= 20) return '🟡';
    return '🔴';
  }

  getTpsColor(tps) {
    if (tps === null || tps === undefined) return 0x555555;
    if (tps >= 35) return 0x39ff14;
    if (tps >= 20) return 0xdfff00;
    return 0xff073a;
  }

  splitTeamNameAndRole(name) {
    if (!name) return { faction: name || '', role: '' };
    const parts = name.split(/\s+/);
    const ROLE_KEYWORDS = [
      'combinedarms', 'mechanized', 'armored', 'motorized', 'airassault',
      'amphibious', 'lightinfantry', 'infantry', 'support', 'logistics'
    ];
    const roleParts = [];
    const factionParts = [];
    for (const p of parts) {
      if (ROLE_KEYWORDS.some((r) => p.toLowerCase() === r)) roleParts.push(p);
      else factionParts.push(p);
    }
    const role = roleParts.map((r) => r.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' ');
    return { faction: factionParts.join(' ') || name, role };
  }

  cleanTeamName(raw) {
    if (!raw) return raw;

    let name = raw.replace(/^FSTemplate[_ ]*/i, '');

    name = name.replace(/_/g, ' ');

    name = name.replace(/\b(LO|HI|MID|INF|LIGHT|HEAVY)\b/gi, '');

    name = name.replace(/\s{2,}/g, ' ').trim();

    return name;
  }

  parseLayerClassname(classname) {
    if (!classname) return { mapName: null, gamemode: null };
    const parts = classname.split('_');
    const mapName = parts[0] || null;

    const KNOWN_GAMEMODES = [
      'AAS', 'RAAS', 'Invasion', 'TC', 'Skirmish', 'Seed',
      'Destruction', 'Insurgency', 'Training', 'Track', 'Tanks'
    ];
    let gamemode = null;
    for (let i = 1; i < parts.length; i++) {
      const segment = parts[i];
      const found = KNOWN_GAMEMODES.find((g) => g.toUpperCase() === segment.toUpperCase());
      if (found) {
        gamemode = found;
        break;
      }
      if (segment.includes('-')) {
        for (const sub of segment.split('-')) {
          const subFound = KNOWN_GAMEMODES.find((g) => g.toUpperCase() === sub.toUpperCase());
          if (subFound) {
            gamemode = subFound;
            break;
          }
        }
        if (gamemode) break;
      }
    }

    const TRAINING_MAPS = ['jensensrange', 'jensen', 'training'];
    if (!gamemode && mapName) {
      const mapLower = mapName.toLowerCase();
      if (TRAINING_MAPS.some((t) => mapLower.includes(t))) gamemode = 'Training';
    }

    return { mapName, gamemode };
  }

  formatMapName(raw) {
    if (!raw) return null;
    return raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  }

  // ───────────────────── Team Data ─────────────────────

  async getTeamData() {
    const players = this.server.players || [];
    const squads = this.server.squads || [];
    const layer = this.server.currentLayer || {};

    const team1Players = players.filter((p) => p.teamID === 1).length;
    const team2Players = players.filter((p) => p.teamID === 2).length;
    const team1Squads = squads.filter((sq) => sq.teamID === 1).length;
    const team2Squads = squads.filter((sq) => sq.teamID === 2).length;

    let team1Name = null;
    let team2Name = null;
    let team1Faction = '';
    let team2Faction = '';

    try {
      if (this.server?.rcon?.execute) {
        const raw = await this.server.rcon.execute('ShowServerInfo').catch(() => null);
        if (raw) {
          try {
            const info = JSON.parse(raw);
            if (info) {
              this.cachedRconInfo = info;
              team1Name = info.TeamOne_s || null;
              team2Name = info.TeamTwo_s || null;
              this.verbose(3, `ShowServerInfo teams: '${team1Name}' vs '${team2Name}'`);
            }
          } catch (_) {
          }
        }
      }
    } catch (_) {
    }

    if (layer.teams?.length >= 2) {
      team1Faction = layer.teams[0]?.faction || '';
      team2Faction = layer.teams[1]?.faction || '';

      if (!team1Name) team1Name = layer.teams[0]?.name || layer.teams[0]?.faction || null;
      if (!team2Name) team2Name = layer.teams[1]?.name || layer.teams[1]?.faction || null;
    }

    if ((!team1Name || !team2Name) && Layers) {
      try {
        const candidates = [layer.layerid, layer.classname, layer.name, layer.map?.name].filter(
          Boolean
        );
        let meta = null;
        for (const key of candidates) {
          if (typeof Layers.getLayerByClassname === 'function')
            meta = await Layers.getLayerByClassname(key).catch(() => null);
          if (!meta && typeof Layers.getLayerByName === 'function')
            meta = await Layers.getLayerByName(key).catch(() => null);
          if (meta) break;
        }
        if (meta?.teams) {
          if (!team1Name) team1Name = meta.teams[0]?.name || meta.teams[0]?.faction || null;
          if (!team2Name) team2Name = meta.teams[1]?.name || meta.teams[1]?.faction || null;
          if (!team1Faction && meta.teams[0]?.faction) team1Faction = meta.teams[0].faction;
          if (!team2Faction && meta.teams[1]?.faction) team2Faction = meta.teams[1].faction;
        }
      } catch (_) {
      }
    }

    if (!team1Name) team1Name = 'Team 1';
    if (!team2Name) team2Name = 'Team 2';

    const team1Emoji = this.resolveEmojiForTeam(team1Name, team1Faction);
    const team2Emoji = this.resolveEmojiForTeam(team2Name, team2Faction);

    team1Name = this.cleanTeamName(team1Name);
    team2Name = this.cleanTeamName(team2Name);

    return {
      team1: {
        name: team1Name,
        players: team1Players,
        squads: team1Squads,
        faction: team1Faction,
        emoji: team1Emoji
      },
      team2: {
        name: team2Name,
        players: team2Players,
        squads: team2Squads,
        faction: team2Faction,
        emoji: team2Emoji
      }
    };
  }

  // ───────────────────── Embed Builder ─────────────────────
  async buildMessage() {
    const s = this.options.strings;

    // ── Gather data ──
    const tpsValue = this.tickRate !== null ? this.tickRate.toFixed(1) : '—';
    const tpsEmoji = this.getTpsEmoji(this.tickRate);
    const playerCount = this.server.a2sPlayerCount || 0;
    const squadCount = (this.server.squads || []).length;
    const publicQueue = this.server.publicQueue || 0;
    const reserveQueue = this.server.reserveQueue || 0;
    const totalQueue = publicQueue + reserveQueue;

    const td = await this.getTeamData();

    let displayMapName = this.server.currentLayer?.map?.name || null;
    let displayGamemode = this.server.currentLayer?.gamemode || null;
    const layerClassname = this.server.currentLayer?.classname
      || this.server.currentLayer?.layerid
      || this.cachedRconInfo?.MapName_s
      || null;

    if (!displayMapName) {
      try {
        if (this.server?.rcon?.getCurrentMap) {
          const mapInfo = await this.server.rcon.getCurrentMap().catch(() => null);
          if (mapInfo?.level) displayMapName = this.formatMapName(mapInfo.level);
        }
      } catch (_) {}
    }

    if (!displayMapName || !displayGamemode) {
      const rconLayer = this.cachedRconInfo?.MapName_s;
      if (rconLayer) {
        const parsed = this.parseLayerClassname(rconLayer);
        if (!displayMapName && parsed.mapName) displayMapName = this.formatMapName(parsed.mapName);
        if (!displayGamemode) displayGamemode = parsed.gamemode;
      }
    }

    if (!displayGamemode) {
      try {
        const plugins = this.server.plugins || [];
        const gm = plugins.find((p) => p && typeof p.getCurrentGameMode === 'function');
        if (gm) displayGamemode = gm.getCurrentGameMode() || null;
      } catch (_) { /* ignore */ }
    }

    // ── Description (match time + TPS) ──
    const timeAgo = this.getTimeAgo(this.server.matchStartTime);
    const matchLine = s.matchStarted.replace('{time}', timeAgo);
    const description = `${matchLine}\n\n${tpsEmoji} **${tpsValue} TPS**\n\u200b`;

    // ── Embed ──
    const embed = new EmbedBuilder()
      .setTitle(s.title)
      .setDescription(description)
      .setColor(this.getTpsColor(this.tickRate))
      .setTimestamp()
      .setFooter({ text: COPYRIGHT_MESSAGE });

    const t1Split = this.splitTeamNameAndRole(td.team1.name);
    const t2Split = this.splitTeamNameAndRole(td.team2.name);
    const t1Title = `${t1Split.faction} ${td.team1.emoji || ''}`;
    const t2Title = `${t2Split.faction} ${td.team2.emoji || ''}`;
    const t1Value = `${t1Split.role ? t1Split.role + '\n' : ''}${s.player}: **${td.team1.players}**\n${s.squad}: **${td.team1.squads}**`;
    const t2Value = `${t2Split.role ? t2Split.role + '\n' : ''}${s.player}: **${td.team2.players}**\n${s.squad}: **${td.team2.squads}**`;

    const queueTitle = totalQueue > 0 ? `${totalQueue} oyuncu sırada...` : s.queue;

    embed.addFields(
      {
        name: s.playerAndSquad,
        value: `${s.player}: **${playerCount}**\n${s.squad}: **${squadCount}**`,
        inline: true
      },
      {
        name: queueTitle,
        value: `Public: **${publicQueue}**\nWhitelist: **${reserveQueue}**`,
        inline: true
      },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: t1Title, value: t1Value, inline: true },
      { name: t2Title, value: t2Value, inline: true },
      { name: '\u200b', value: '\u200b', inline: true }
    );
    embed.addFields(
      { name: s.map, value: displayMapName || s.unknown, inline: false },
      { name: s.gamemode, value: displayGamemode || s.unknown, inline: false }
    );

    // ── Harita Görseli ──
    const mapImagePath = this.getMapImagePath();
    const files = [];
    if (mapImagePath) {
      embed.setImage('attachment://map.png');
      files.push({ attachment: mapImagePath, name: 'map.png' });
    }

    // ── Active Admins Button ──
    const components = [];
    try {
      const row = new ActionRowBuilder();
      const customId = `discord-live-server-status:active-admins:${this.server.id}`;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(s.activeAdminsButton)
          .setStyle(ButtonStyle.Danger)
      );
      if (row.components?.length) components.push(row);
    } catch (err) {
      this.verbose(1, `Button creation error: ${err.message}`);
    }

    // ── Result ──
    const result = { embeds: [embed], components };
    if (files.length) result.files = files.map((f) => ({ attachment: f.attachment, name: f.name }));
    return result;
  }

  // ───────────────────── Interaction Handler ─────────────────────
  async onInteraction(interaction) {
    try {
      if (!interaction.isButton || !interaction.isButton()) return;

      const expectedId = `discord-live-server-status:active-admins:${this.server.id}`;
      if (interaction.customId !== expectedId) return;

      const s = this.options.strings;
      const players = this.server.players || [];

      // Collect admin SteamIDs
      const adminSteamSet = new Set();
      try {
        if (this.server.admins) {
          Object.keys(this.server.admins).forEach((sid) => adminSteamSet.add(sid));
        }
        if (typeof this.server.getAdminsWithPermission === 'function') {
          const permAdmins = this.server.getAdminsWithPermission('canseeadminchat') || [];
          permAdmins.forEach((sid) => adminSteamSet.add(sid));
        }
      } catch (_) {
      }

      // Find active admins currently on the server
      const admins = players
        .filter((p) => p && (p.isAdmin || (p.steamID && adminSteamSet.has(p.steamID))))
        .map((p) => p.name || p.suffix || p.steamID);

      const embed = new EmbedBuilder()
        .setTitle(s.activeAdminsTitle)
        .setColor(0xff0000)
        .setTimestamp()
        .setFooter({ text: COPYRIGHT_MESSAGE });

      if (admins.length === 0) {
        embed.setDescription(s.noActiveAdmins);
      } else {
        embed.setDescription(
          admins
            .slice(0, 25)
            .map((n) => `• ${n}`)
            .join('\n')
        );
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      this.verbose(1, `Interaction error: ${err.message}`);
      try {
        if (interaction && !interaction.replied) {
          await interaction.reply({
            content: this.options.strings.interactionError,
            ephemeral: true
          });
        }
      } catch (_) {
      }
    }
  }

  // ───────────────────── Update Loop ─────────────────────
  async updateEmbed() {
    if (!this.channel) {
      this.verbose(1, 'Channel not available – skipping update.');
      return;
    }
    if (this._updating) return;
    this._updating = true;

    try {
      const message = await this.buildMessage();
      const currentMapKey = this.getMapImageKey();
      const mapChanged = this.lastMapKey !== null && this.lastMapKey !== currentMapKey;

      if (this.statusMessage) {
        try {
          const editPayload = { embeds: message.embeds, components: message.components };
          if (mapChanged && message.files?.length) editPayload.files = message.files;
          await this.statusMessage.edit(editPayload);
          this.verbose(2, 'Server status embed updated.');
        } catch (err) {
          this.verbose(1, `Edit failed: ${err.message}`);
          this.statusMessage = null;

          if (Date.now() - this._lastSendTime > 30000) {
            await this.findExistingMessage();
            if (!this.statusMessage) {
              try {
                this.statusMessage = await this.channel.send(message);
                this._lastSendTime = Date.now();
                this.verbose(1, `Sent replacement message (ID: ${this.statusMessage.id}).`);
              } catch (sendErr) {
                this.verbose(1, `Failed to send replacement: ${sendErr.message}`);
              }
            }
          } else {
            this.verbose(2, 'Send cooldown active – will retry edit on next cycle.');
            await this.findExistingMessage();
          }
        }
      } else {
        await this.findExistingMessage();
        if (!this.statusMessage) {
          try {
            this.statusMessage = await this.channel.send(message);
            this._lastSendTime = Date.now();
            this.verbose(1, `New status message sent (ID: ${this.statusMessage.id}).`);
          } catch (sendErr) {
            this.verbose(1, `Failed to send message: ${sendErr.message}`);
          }
        }
      }

      this.lastMapKey = currentMapKey;
    } catch (err) {
      this.verbose(1, `Failed to update embed: ${err.message}`);
    } finally {
      this._updating = false;
    }
  }

  // ───────────────────── Bot Presence ─────────────────────
  async updateBotStatus() {
    try {
      const count = this.server.a2sPlayerCount || 0;
      const max = this.server.publicSlots || 0;
      const layer = this.server.currentLayer?.name || 'Unknown';

      await this.options.discordClient.user.setActivity(`(${count}/${max}) ${layer}`, {
        type: 'WATCHING'
      });
    } catch (err) {
      this.verbose(1, `Failed to update bot presence: ${err.message}`);
    }
  }
}
