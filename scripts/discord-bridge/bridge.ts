/**
 * FounderFirst Discord bridge — the dumb relay.
 *
 * The bridge has zero opinions about voice, prompts, retrieval, or who a user is.
 * All of that lives in the Cloudflare Worker (site-bubble/worker). This file just:
 *
 *   1. Listens to Discord gateway events.
 *   2. POSTs them to the Worker with a shared secret.
 *   3. Posts whatever the Worker replies back to Discord.
 *   4. Creates per-user private channels when the Worker asks.
 *
 * If you find yourself adding a system prompt, an LLM client, or a Supabase
 * query in this file, stop. That belongs in the Worker.
 *
 * Env vars (see .env.example):
 *   WORKER_BASE_URL                 https://bubble.founderfirst.one
 *   BRIDGE_SECRET                   same value as `wrangler secret put DISCORD_BRIDGE_SECRET`
 *   DISCORD_BOT_TOKEN               your bot token
 *   DISCORD_GUILD_ID                snowflake of the FounderFirst server
 *   DISCORD_USER_CHANNEL_PARENT_ID  category id where per-user channels live
 *   ADMIN_POLL_INTERVAL_SECONDS     (optional, default 15) — admin-reply poll cadence
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
  Events,
  type TextChannel,
  type User,
  type Message,
  type Interaction,
} from "discord.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} missing`);
    process.exit(1);
  }
  return v;
}

const WORKER_BASE_URL = required("WORKER_BASE_URL").replace(/\/+$/, "");
const BRIDGE_SECRET = required("BRIDGE_SECRET");
const DISCORD_BOT_TOKEN = required("DISCORD_BOT_TOKEN");
const DISCORD_GUILD_ID = required("DISCORD_GUILD_ID");
const DISCORD_USER_CHANNEL_PARENT_ID = required("DISCORD_USER_CHANNEL_PARENT_ID");
const ADMIN_POLL_INTERVAL_SECONDS = Number(
  process.env.ADMIN_POLL_INTERVAL_SECONDS ?? "15",
);

const AUTH_HEADERS = {
  Authorization: `Bearer ${BRIDGE_SECRET}`,
  "Content-Type": "application/json",
};

const log = {
  info: (...a: unknown[]) => console.log(new Date().toISOString(), "INFO", ...a),
  error: (...a: unknown[]) => console.error(new Date().toISOString(), "ERROR", ...a),
};

// ---------------------------------------------------------------------------
// Discord client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  // Partials needed to receive DM events for channels not cached at startup.
  partials: [Partials.Channel, Partials.Message],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST to the Worker, throw on non-2xx, return parsed JSON. */
async function workerPost(
  path: string,
  payload: Record<string, unknown>,
): Promise<Record<string, any>> {
  const r = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).slice(0, 300);
    log.error(`worker ${path} -> ${r.status} ${text}`);
    throw new Error(`worker ${path} ${r.status}`);
  }
  return (await r.json()) as Record<string, any>;
}

/** True if this is one of our per-user private text channels. */
function isUserPrivateChannel(ch: Message["channel"]): boolean {
  return (
    ch.type === ChannelType.GuildText &&
    ch.parentId === DISCORD_USER_CHANNEL_PARENT_ID
  );
}

/**
 * Create a private channel for this user under the configured parent category,
 * then tell the Worker about the channel id so future routing can target it.
 */
async function ensureUserChannel(user: User, email: string): Promise<TextChannel> {
  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  if (!guild) throw new Error(`bot not in guild ${DISCORD_GUILD_ID}`);

  const parent = await guild.channels.fetch(DISCORD_USER_CHANNEL_PARENT_ID);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    throw new Error(`parent category ${DISCORD_USER_CHANNEL_PARENT_ID} missing`);
  }

  let safe = email.split("@")[0].toLowerCase().replace(/\./g, "-").slice(0, 24);
  safe = (safe.match(/[a-z0-9-]/g) ?? []).join("") || "user";
  const name = `p-${safe}-${Number(user.id) % 10000}`;

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: DISCORD_USER_CHANNEL_PARENT_ID,
    topic: `Penny <-> ${email} -- private. Disconnect with /disconnect.`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  await workerPost("/discord/attach-channel", {
    discord_user_id: user.id,
    discord_channel_id: channel.id,
  });

  await channel.send(
    `Hey <@${user.id}> — this is your private line with Penny. ` +
      `Only you and the team can see what we discuss here.`,
  );
  return channel;
}

// ---------------------------------------------------------------------------
// Inbound message handling
// ---------------------------------------------------------------------------

client.once(Events.ClientReady, async (c) => {
  log.info(`logged in as ${c.user.tag} (id=${c.user.id}); syncing slash commands`);
  try {
    const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(c.user.id, DISCORD_GUILD_ID),
      {
        body: [
          {
            name: "disconnect",
            description: "Disconnect Penny from your FounderFirst account",
          },
        ],
      },
    );
  } catch (e) {
    log.error("slash command sync failed", e);
  }
  // TODO: enable once /discord/admin-replies/* endpoints exist on the Worker.
  // void adminReplyPoller();
});

client.on(Events.MessageCreate, async (msg: Message) => {
  if (msg.author.bot) return;
  if (msg.content.startsWith("/")) return; // slash commands handled separately

  const isDm = msg.channel.type === ChannelType.DM;
  if (!(isDm || isUserPrivateChannel(msg.channel))) return; // ignore public chatter

  let res: Record<string, any>;
  try {
    res = await workerPost("/discord/dm", {
      discord_user_id: msg.author.id,
      discord_username: msg.author.tag,
      message: msg.content,
      channel_id: msg.channel.id,
      is_dm: isDm,
    });
  } catch (e) {
    log.error(`worker /discord/dm failed for user=${msg.author.id}`, e);
    if (msg.channel.isSendable()) {
      await msg.channel.send("Sorry — something's off on our end. Try again in a minute.");
    }
    return;
  }

  const reply = res.reply || "(no reply)";
  let target: { send: (s: string) => Promise<unknown> } = msg.channel as TextChannel;

  // Linked user, first message in DM, no per-user channel yet → spin one up.
  if (res.kind === "ok" && isDm && res.discord_channel_id == null && res.email) {
    try {
      target = await ensureUserChannel(msg.author, res.email);
    } catch (e) {
      log.error(`could not create per-user channel for ${msg.author.id}`, e);
      // Fall back to the DM so the user still gets a reply.
    }
  }

  await target.send(reply);
});

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "disconnect") {
    return;
  }
  try {
    await workerPost("/discord/disconnect", { discord_user_id: interaction.user.id });
  } catch (e) {
    log.error(`worker /discord/disconnect failed for ${interaction.user.id}`, e);
    await interaction.reply({
      content: "Couldn't reach the server — try again in a minute.",
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    content:
      "Done — I've forgotten your FounderFirst account. " +
      "Send me a message anytime to reconnect.",
    ephemeral: true,
  });
});

// ---------------------------------------------------------------------------
// Poller — pick up admin replies and post them (disabled until Worker supports it)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function adminReplyPoller(): Promise<void> {
  for (;;) {
    try {
      const res = await workerPost("/discord/admin-replies/pending", {});
      for (const reply of res.replies ?? []) {
        const ch = await client.channels.fetch(String(reply.discord_channel_id));
        if (ch && ch.isTextBased() && ch.isSendable()) {
          const sent = await ch.send(reply.body);
          await workerPost("/discord/admin-replies/ack", {
            delivery_id: reply.delivery_id,
            discord_message_id: sent.id,
          });
        }
      }
    } catch (e) {
      log.error("admin reply poller failed", e);
    }
    await new Promise((r) => setTimeout(r, ADMIN_POLL_INTERVAL_SECONDS * 1000));
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

void client.login(DISCORD_BOT_TOKEN);
