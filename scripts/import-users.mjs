/**
 * Import users từ database.json lên Supabase Auth.
 *
 * Cách chạy:
 * 1. Copy .env.example → .env, dán SERVICE_ROLE_KEY
 * 2. Chạy SQL: supabase/migrations/001_init.sql trên Dashboard
 * 3. node scripts/import-users.mjs
 *
 * Lưu ý mật khẩu:
 * - Supabase yêu cầu mật khẩu ≥ 6 ký tự
 * - Trong JSON đang là "01" → script map thành "Pass01"
 * - Đăng nhập app bằng email + Pass01
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zfawytyfeaxvrvtjvsun.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === "YOUR_SERVICE_ROLE_KEY") {
  console.error(
    "Thiếu SUPABASE_SERVICE_ROLE_KEY.\n" +
      "→ Copy .env.example thành .env rồi dán service_role key\n" +
      "→ Lấy tại: Dashboard → Project Settings → API → service_role (secret)"
  );
  process.exit(1);
}

/** Map mật khẩu JSON ngắn → đạt min 6 ký tự của Supabase */
function resolvePassword(raw) {
  const pwd = String(raw ?? "").trim();
  if (pwd.length >= 6) return { password: pwd, mapped: false };
  // "01" → "Pass01"
  return { password: `Pass${pwd || "01"}`, mapped: true };
}

async function createUser(user) {
  const email = user.gmail?.trim();
  if (!email) throw new Error("Thiếu gmail");

  const { password, mapped } = resolvePassword(user.password);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      "User-Agent": "ProjectManager-Import/1.0 (node)",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: user.name || email,
        employee_id: user.employeeId || null,
        position: user.position || null,
        theme_color: user.themeColor || null,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.msg || body?.message || body?.error_description || JSON.stringify(body);
    // User đã tồn tại → coi như skip
    if (
      res.status === 422 ||
      /already|exists|registered/i.test(String(msg))
    ) {
      return { ok: true, skipped: true, email, detail: msg };
    }
    return { ok: false, email, detail: msg };
  }

  return {
    ok: true,
    skipped: false,
    email,
    id: body.id,
    loginPassword: password,
    mapped,
  };
}

async function main() {
  const jsonPath = resolve(root, "database.json");
  const users = JSON.parse(readFileSync(jsonPath, "utf8"));

  if (!Array.isArray(users) || users.length === 0) {
    console.error("database.json trống hoặc sai format.");
    process.exit(1);
  }

  console.log(`Import ${users.length} users → ${SUPABASE_URL}\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let mappedPasswordNote = false;

  for (const user of users) {
    const result = await createUser(user);
    if (result.mapped) mappedPasswordNote = true;

    if (result.ok && result.skipped) {
      skipped += 1;
      console.log(`SKIP  ${result.email}  (${result.detail})`);
    } else if (result.ok) {
      created += 1;
      console.log(`OK    ${result.email}  id=${result.id}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${result.email}  ${result.detail}`);
    }

    // tránh rate limit nhẹ
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nXong: created=${created}, skipped=${skipped}, failed=${failed}`);
  if (mappedPasswordNote) {
    console.log(
      "\n⚠  Mật khẩu trong JSON ngắn hơn 6 ký tự → đã map thành Pass01\n" +
        "   Ví dụ đăng nhập: dang.duy.hoang@vard.com / Pass01"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
