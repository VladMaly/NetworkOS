import { readFile } from "node:fs/promises"
import path from "node:path"
import { currentUser } from "../../lib/session"

/* The founder's real contacts for the NetworkOS page. They are personal data (phones, emails, private notes), so they
   never sit in public/: only the owner, signed in with Google, gets them. Everyone else sees the page's example network.
   NETWORKOS_CONTACTS_CSV: the export's path (relative to the website folder). NETWORKOS_OWNER_EMAILS: who may read it. */
const FILE = process.env.NETWORKOS_CONTACTS_CSV ?? "../Networking and Database - Contacts.csv"
const OWNERS = (process.env.NETWORKOS_OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)

/* The export's Russian column names → the page's field names. */
const COLUMNS: Record<string, string> = {
  "ID контакта": "id", "Имя": "name", "Компания": "company", "О компании": "about", "Роль": "role", "Где познакомились": "where",
  "Дата знакомства": "met", "Кто познакомил": "via", "Теги": "tags", "Telegram": "telegram", "WhatsApp": "whatsapp", "LinkedIn": "linkedin",
  "Instagram": "instagram", "Email": "email", "Телефон": "phone", "Основной канал": "channel", "Теплота контакта": "warmth",
  "Потенциальная возможность": "opportunity", "Чем могу быть полезна": "help", "Заметки": "notes", "Последний контакт": "last",
  "Следующий шаг": "next", "Дата фоллоу-апа": "followup", "Статус": "status", "Приоритет": "priority", "Действие требуется": "action",
  "Служебное: follow-up": "due",
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = "", quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(cell); cell = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(cell); rows.push(row); row = []; cell = ""
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export async function GET() {
  const user = await currentUser()
  if (!user) return Response.json({ error: "Sign in to see your contacts." }, { status: 401 })
  if (!OWNERS.includes(user.email.toLowerCase())) return Response.json({ error: "These contacts belong to someone else." }, { status: 403 })
  let text: string
  try {
    text = await readFile(path.resolve(process.cwd(), FILE), "utf8")
  } catch {
    return Response.json({ error: "The contacts file isn't on this server (NETWORKOS_CONTACTS_CSV)." }, { status: 404 })
  }
  const [head, ...rows] = parseCSV(text.replace(/^﻿/, ""))
  const keys = head.map((h) => COLUMNS[h.trim()])
  const contacts = rows
    .map((r) => Object.fromEntries(keys.flatMap((k, i) => (k ? [[k, (r[i] ?? "").trim()]] : []))))
    .filter((c) => c.name)
  return Response.json({ contacts }, { headers: { "Cache-Control": "private, no-store" } })
}
