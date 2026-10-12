<?php
// GOPASS PHP Backend
// Replaces the Node/Express API. Intended for Apache/cPanel PHP hosting.

declare(strict_types=1);

// A notice or warning printed before a header() call breaks every redirect and
// JSON response that follows it, so diagnostics go to the log, never the body.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

const SESSION_TTL = 604800; // 7 days
const SESSION_REFRESH_WINDOW = 86400; // refresh when less than 24h remains
const MAX_UPLOAD = 5242880; // 5MB

$ROOT = dirname(__DIR__);
$configFile = $ROOT . '/config.php';
$GOPASS_CONFIG = is_file($configFile) ? (require $configFile) : [];
if (!is_array($GOPASS_CONFIG)) $GOPASS_CONFIG = [];
$DATA = $ROOT . '/data';
$UPLOADS = $ROOT . '/uploads';
if (!is_dir($DATA)) @mkdir($DATA, 0775, true);
if (!is_dir($UPLOADS)) @mkdir($UPLOADS, 0775, true);

function json_out($data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function body_json(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}
function db_read(string $file, array $fallback = []): array {
    if (!is_file($file)) return $fallback;
    $raw = file_get_contents($file);
    $d = json_decode($raw ?: '', true);
    return is_array($d) ? $d : $fallback;
}
/* Storage failures must never be silent. A dropped write used to look
   identical to "not logged in" (no session file -> user: null -> the login
   button comes back), which is undebuggable from the browser. Every write is
   verified, and a real failure raises so the caller can report it. */
function db_write(string $file, array $data): void {
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('cannot create data directory: ' . $dir);
    }
    if (!is_writable($dir)) {
        throw new RuntimeException('data directory is not writable: ' . $dir);
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) throw new RuntimeException('cannot encode json for ' . $file);
    $tmp = $file . '.tmp.' . bin2hex(random_bytes(4));
    $w = @file_put_contents($tmp, $json, LOCK_EX);
    if ($w === false || $w !== strlen($json)) {
        @unlink($tmp);
        throw new RuntimeException('cannot write ' . $tmp);
    }
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('cannot move temp file into ' . $file);
    }
}
function storage_ok(string $dataDir): bool {
    return is_dir($dataDir) && is_writable($dataDir);
}
function db_update(string $file, callable $fn, array $fallback = []): array {
    $data = db_read($file, $fallback);
    $fn($data);
    db_write($file, $data);
    return $data;
}
function now_iso(): string { return gmdate('c'); }
function clean_str($v): string { return is_string($v) ? trim($v) : ''; }
function money(int|float $value): string { return $value == 0 ? 'ฟรี' : number_format((float)$value, 0, '.', ',') . ' บาท'; }
function default_ticket_types(array $e): array {
    return [
        ['id'=>'regular','name'=>'บัตรธรรมดา','description'=>'สิทธิ์เข้างานตามมาตรฐาน','price'=>(float)($e['regular'] ?? 0)],
        ['id'=>'vip','name'=>'บัตร VIP','description'=>'สิทธิ์พิเศษสำหรับผู้ถือบัตร VIP','price'=>(float)($e['vip'] ?? 0)],
    ];
}
function public_event(array $e): array {
    $types = !empty($e['ticketTypes']) && is_array($e['ticketTypes']) ? $e['ticketTypes'] : default_ticket_types($e);
    $e['ticketTypes'] = $types;
    $e['limitPerOrder'] = max(1, (int)($e['limitPerOrder'] ?? 10));
    $e['ticketMode'] = ($e['ticketMode'] ?? 'standing') === 'seatmap' ? 'seatmap' : 'standing';
    if ($e['ticketMode'] !== 'seatmap') $e['seatMap'] = null;
    return $e;
}
function request_path(): string {
    $r = $_GET['route'] ?? '';
    if ($r !== '') {
        $r = '/' . ltrim((string)$r, '/');
        return '/' === $r ? '/' : rtrim($r, '/');
    }
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $p = strpos($uri, '/api');
    if ($p !== false) $uri = substr($uri, $p + 4) ?: '/';
    return '/' . ltrim($uri, '/');
}
function method(): string { return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'); }
function auth_token(): string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(.+)$/i', $h, $m)) return trim($m[1]);
    $cookie = $_COOKIE['gopass_admin_token'] ?? '';
    return is_string($cookie) ? trim($cookie) : '';
}
function set_admin_cookie(string $token, int $ttl = SESSION_TTL): void {
    setcookie('gopass_admin_token', $token, [
        'expires' => time() + $ttl,
        'path' => '/',
        'secure' => request_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
function clear_admin_cookie(): void {
    setcookie('gopass_admin_token', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => request_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
function admin_file(string $root): string { return $root . '/data/admin.json'; }
function sessions_file(string $root): string { return $root . '/data/sessions.json'; }
function ensure_admin(string $root): array {
    $file = admin_file($root);
    if (is_file($file)) {
        $d = db_read($file, []);
        if (!empty($d['username']) && !empty($d['passwordHash'])) return $d;
    }
    $user = getenv('ADMIN_USER') ?: ($GLOBALS['GOPASS_CONFIG']['admin_user'] ?? 'admin');
    $pass = getenv('ADMIN_PASS') ?: ($GLOBALS['GOPASS_CONFIG']['admin_pass'] ?? 'P@ssw0rd');
    $d = ['username'=>$user,'passwordHash'=>password_hash($pass, PASSWORD_DEFAULT)];
    db_write($file, $d);
    return $d;
}
function current_admin(string $root): ?array {
    $token = auth_token();
    if ($token === '') return null;
    $file = sessions_file($root);
    $sessions = db_read($file, []);
    $now = time(); $changed = false; $found = null;
    foreach ($sessions as $i => $s) {
        if (($s['expiresAt'] ?? 0) < $now) { unset($sessions[$i]); $changed = true; continue; }
        if (($s['token'] ?? '') === $token) {
            $expiresAt = (int)($s['expiresAt'] ?? 0);
            if ($expiresAt - $now < SESSION_REFRESH_WINDOW) {
                $sessions[$i]['expiresAt'] = $now + SESSION_TTL;
                $s['expiresAt'] = $now + SESSION_TTL;
                $changed = true;
                set_admin_cookie($token);
            }
            $found = ['username'=>$s['username'] ?? 'admin', 'token'=>$token];
        }
    }
    if ($changed) db_write($file, array_values($sessions));
    return $found;
}
function require_admin(string $root): array {
    $a = current_admin($root);
    if (!$a) json_out(['error'=>'unauthorized','message'=>'กรุณาเข้าสู่ระบบแอดมินก่อน'], 401);
    return $a;
}
/* การกดบัตรต้องล็อกอินก่อน (Discord) เพื่อให้รู้ว่าใครเป็นเจ้าของคำสั่งซื้อ
   แล้วเจ้าตัวเปิดดูประวัติการกดบัตรของตัวเองได้ */
function require_user(string $root): array {
    $u = current_user($root);
    if (!$u) json_out(['error'=>'unauthorized','message'=>'กรุณาเข้าสู่ระบบก่อนกดบัตร'], 401);
    return $u;
}

// ---------- Discord OAuth (login only, no bot / no guild roles) ----------
function request_is_https(): bool {
    if (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') return true;
    return !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
}
function discord_config(): array {
    $c = $GLOBALS['GOPASS_CONFIG'] ?? [];
    return [
        'client_id'     => (string)(getenv('DISCORD_CLIENT_ID') ?: ($c['discord_client_id'] ?? '')),
        'client_secret' => (string)(getenv('DISCORD_CLIENT_SECRET') ?: ($c['discord_client_secret'] ?? '')),
        'redirect_uri'  => (string)(getenv('DISCORD_REDIRECT_URI') ?: ($c['discord_redirect_uri'] ?? '')),
    ];
}
function discord_configured(): bool {
    $c = discord_config();
    return $c['client_id'] !== '' && $c['client_secret'] !== '' && $c['redirect_uri'] !== '';
}
function discord_avatar_url(string $id, string $hash): string {
    if ($id === '') return '';
    if ($hash !== '') return 'https://cdn.discordapp.com/avatars/' . $id . '/' . $hash . '.png?size=128';
    return 'https://cdn.discordapp.com/embed/avatars/' . (intdiv((int)$id, 4194304) % 6) . '.png';
}
function user_sessions_file(string $root): string { return $root . '/data/user_sessions.json'; }
function user_token(): string {
    $c = $_COOKIE['gopass_user_token'] ?? '';
    return is_string($c) ? trim($c) : '';
}
function set_user_cookie(string $token, int $ttl = SESSION_TTL): void {
    setcookie('gopass_user_token', $token, ['expires'=>time()+$ttl,'path'=>'/','secure'=>request_is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
function clear_user_cookie(): void {
    setcookie('gopass_user_token', '', ['expires'=>time()-3600,'path'=>'/','secure'=>request_is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
function set_oauth_state(string $state): void {
    setcookie('gopass_oauth_state', $state, ['expires'=>time()+600,'path'=>'/','secure'=>request_is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
function clear_oauth_state(): void {
    setcookie('gopass_oauth_state', '', ['expires'=>time()-3600,'path'=>'/','secure'=>request_is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
/* จำปลายทางหลังล็อกอินสำเร็จ (เช่น กลับไปหน้าคิว/เลือกบัตรที่เพิ่งกด "กดบัตร")
   เก็บเป็น cookie ชั่วคราว เพื่อไม่ให้สะดุดตอน Discord เด้งกลับมา */
function set_login_next(string $next): void {
    setcookie('gopass_login_next', $next, ['expires'=>time()+900,'path'=>'/','secure'=>request_is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
function clear_login_next(): void {
    setcookie('gopass_login_next', '', ['expires'=>time()-3600,'path'=>'/','secure'=>request_is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
/* อนุญาตเฉพาะ path ภายในเว็บเดียวกัน (ขึ้นต้นด้วย / เดียว) กัน open redirect */
function safe_next_path(string $next): string {
    $next = trim($next);
    if ($next === '' || $next[0] !== '/' || str_starts_with($next, '//')) return '';
    if (str_contains($next, "\n") || str_contains($next, "\r")) return '';
    return $next;
}
function current_user(string $root): ?array {
    $token = user_token();
    if ($token === '') return null;
    $file = user_sessions_file($root);
    $sessions = db_read($file, []);
    $now = time(); $changed = false; $found = null;
    foreach ($sessions as $i => $s) {
        if (($s['expiresAt'] ?? 0) < $now) { unset($sessions[$i]); $changed = true; continue; }
        if (($s['token'] ?? '') === $token) {
            if (((int)($s['expiresAt'] ?? 0)) - $now < SESSION_REFRESH_WINDOW) {
                $sessions[$i]['expiresAt'] = $now + SESSION_TTL;
                $changed = true;
                set_user_cookie($token);
            }
            $id = (string)($s['id'] ?? '');
            $found = [
                'id'          => $id,
                'username'    => (string)($s['username'] ?? ''),
                'displayName' => (string)($s['displayName'] ?? ''),
                'avatar'      => (string)($s['avatar'] ?? ''),
                'email'       => (string)($s['email'] ?? ''),
                'avatarUrl'   => discord_avatar_url($id, (string)($s['avatar'] ?? '')),
            ];
        }
    }
    if ($changed) {
        try { db_write($file, array_values($sessions)); }
        catch (Throwable $e) { error_log('[gopass] user session refresh failed: ' . $e->getMessage()); }
    }
    return $found;
}
function discord_login_fail(string $code): never {
    clear_oauth_state();
    header('Location: /login.html?error=' . rawurlencode($code), true, 302);
    exit;
}
function make_id(string $prefix): string { return $prefix . '-' . round(microtime(true)*1000) . '-' . bin2hex(random_bytes(3)); }
function is_completed(array $o): bool { return !empty($o['buyer']['email']) || (($o['status'] ?? '') === 'completed'); }
/* คำสั่งซื้อนี้เป็นของผู้ใช้ที่ล็อกอินคนนี้หรือไม่ (รองรับออเดอร์เก่าก่อนมีระบบผูกบัญชี) */
function order_belongs_to(array $o, array $u): bool {
    $uid = (string)($u['id'] ?? '');
    $owner = (string)($o['userId'] ?? '');
    if ($uid !== '' && $owner === $uid) return true;
    $uname = strtolower((string)($u['username'] ?? ''));
    return $owner === '' && $uname !== '' && strtolower((string)($o['buyer']['discord'] ?? '')) === $uname;
}
function cleanup_queues(string $file): void {
    $cut = time() - 15*60;
    db_update($file, function (&$list) use ($cut) {
        foreach ($list as $i => $q) {
            $ts = strtotime((string)($q['createdAt'] ?? ''));
            if ($ts && $ts < $cut) unset($list[$i]);
        }
        $list = array_values($list);
    }, []);
}
function google_sheet(string $root, array $order): array {
    $url = getenv('GOOGLE_SHEET_WEBHOOK_URL') ?: ($GLOBALS['GOPASS_CONFIG']['google_sheet_webhook_url'] ?? '');
    if ($url === '') return ['ok'=>false,'error'=>'missing_google_sheet_config'];
    
    $payload = [
        'id'=>$order['id'] ?? '', 
        'createdAt'=>$order['createdAt'] ?? '', 
        'updatedAt'=>$order['updatedAt'] ?? '',
        'queueCode'=>$order['queueCode'] ?? '', 
        'eventName'=>$order['eventName'] ?? '', 
        'ticketName'=>$order['ticketName'] ?? '',
        'qty'=>(int)($order['qty'] ?? 0), 
        'unitPrice'=>(float)($order['unitPrice'] ?? 0), 
        'total'=>(float)($order['total'] ?? 0),
        'name'=>$order['buyer']['name'] ?? '', 
        'email'=>$order['buyer']['email'] ?? '',
        'discord'=>$order['buyer']['discord'] ?? '', 
        'roblox'=>$order['buyer']['roblox'] ?? ''
    ];
    
    if (!function_exists('curl_init')) return ['ok'=>false,'error'=>'php_curl_missing'];
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_CUSTOMREQUEST => 'POST', // บังคับให้รักษา POST method ไว้เมื่อเกิด Redirect
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => 15
    ]);
    
    // กำหนดค่า CURLOPT_POSTREDIR ด้วย Constant Value (3) เพื่อป้องกัน Constant หายในบางสภาพแวดล้อม PHP
    if (defined('CURLOPT_POSTREDIR')) {
        curl_setopt($ch, CURLOPT_POSTREDIR, 3);
    }
    
    $body = curl_exec($ch); 
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); 
    $err = curl_error($ch);
    
    if ($err) return ['ok'=>false,'error'=>$err];
    
    $result = json_decode((string)$body, true);
    if ($status < 200 || $status >= 300 || !is_array($result) || !($result['ok'] ?? false)) {
        return ['ok'=>false, 'status'=>$status, 'raw_response'=>substr((string)$body, 0, 500)];
    }
    
    return ['ok'=>true,'result'=>$result];
}
function discord_webhook(array $order): array {
    $url = getenv('DISCORD_WEBHOOK_URL') ?: ($GLOBALS['GOPASS_CONFIG']['discord_webhook_url'] ?? '');
    if ($url === '') return ['ok'=>false,'error'=>'missing_discord_webhook'];
    if (!function_exists('curl_init')) return ['ok'=>false,'error'=>'php_curl_missing'];
    $b = $order['buyer'] ?? [];
    $fields = [
        ['name'=>'งาน','value'=>$order['eventName'] ?? '-','inline'=>false],
        ['name'=>'รายการ / คิว','value'=>$order['queueCode'] ?? ($order['id'] ?? '-'),'inline'=>true],
        ['name'=>'บัตร','value'=>($order['ticketName'] ?? '-') . ' × ' . (int)($order['qty'] ?? 0),'inline'=>true],
        ['name'=>'ยอดรวม','value'=>money((float)($order['total'] ?? 0)),'inline'=>true],
        ['name'=>'ชื่อผู้ซื้อ','value'=>$b['name'] ?? '-','inline'=>true],
        ['name'=>'อีเมล','value'=>$b['email'] ?? '-','inline'=>true],['name'=>'Discord','value'=>$b['discord'] ?? '-','inline'=>true],['name'=>'Roblox','value'=>$b['roblox'] ?? '-','inline'=>true]
    ];
    $payload=['username'=>'GOPASS','embeds'=>[['title'=>'🎫 มีรายการกดบัตรใหม่','color'=>0xe0000b,'fields'=>$fields,'timestamp'=>$order['updatedAt'] ?? now_iso(),'footer'=>['text'=>'GOPASS']]]];
    $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode($payload),CURLOPT_TIMEOUT=>10]);
    $body=curl_exec($ch); $status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); $err=curl_error($ch);
    if($err) return ['ok'=>false,'error'=>$err]; if($status<200||$status>=300) return ['ok'=>false,'status'=>$status]; return ['ok'=>true];
}

/* =========================================================
   AREAONE-LIVE (เว็บดูไลฟ์) INTEGRATION
   เมื่อขาย "บัตร LIVE" ระบบจะออกโค้ดเข้าชม (AOL-XXXX-XXXX-XXXX)
   1 โค้ดต่อ 1 บัตร แล้วส่งให้ผู้ซื้อทาง Discord DM ด้วยบอท
   ========================================================= */
function live_config(): array {
    $c = $GLOBALS['GOPASS_CONFIG'] ?? [];
    return [
        'api_url'  => rtrim((string)(getenv('LIVE_API_URL') ?: ($c['live_api_url'] ?? '')), '/'),
        'secret'   => (string)(getenv('LIVE_API_SECRET') ?: ($c['live_api_secret'] ?? '')),
        'site_url' => rtrim((string)(getenv('LIVE_SITE_URL') ?: ($c['live_site_url'] ?? '')), '/'),
        'prefix'   => (string)(getenv('LIVE_CODE_PREFIX') ?: ($c['live_code_prefix'] ?? 'AOL')),
        'bot_token'=> (string)(getenv('DISCORD_BOT_TOKEN') ?: ($c['discord_bot_token'] ?? '')),
    ];
}
function live_http(string $method, string $url, ?array $body=null): array {
    if (!function_exists('curl_init')) return ['ok'=>false,'error'=>'php_curl_missing'];
    $cfg = live_config();
    $headers = ['Accept: application/json', 'x-integration-secret: ' . $cfg['secret']];
    $ch = curl_init($url);
    $opts = [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>12, CURLOPT_HTTPHEADER=>$headers];
    if ($method === 'POST') {
        $headers[] = 'Content-Type: application/json';
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($body ?? [], JSON_UNESCAPED_UNICODE);
        $opts[CURLOPT_HTTPHEADER] = $headers;
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return ['ok'=>false,'error'=>$err];
    $j = json_decode((string)$raw, true);
    if ($status < 200 || $status >= 300) return ['ok'=>false,'status'=>$status,'error'=>is_array($j)&&isset($j['message'])?$j['message']:'live_api_error'];
    return ['ok'=>true,'data'=>is_array($j)?$j:[]];
}
function live_local_code(): string {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $part = function() use ($alphabet): string { $s=''; for($i=0;$i<4;$i++) $s .= $alphabet[random_int(0, strlen($alphabet)-1)]; return $s; };
    $prefix = live_config()['prefix'] ?: 'AOL';
    return $prefix . '-' . $part() . '-' . $part() . '-' . $part();
}
/* ออกโค้ด $qty ใบสำหรับรอบ $showId — เรียกเว็บไลฟ์ก่อน ถ้าติดต่อไม่ได้จะสร้างเองในเครื่อง */
function live_generate_codes(int $qty, string $showId, ?int $expiresInDays=null, ?int $maxDevices=null): array {
    $qty = max(1, $qty);
    $showId = $showId !== '' ? $showId : 'ALL';
    $cfg = live_config();
    if ($cfg['api_url'] !== '' && $cfg['secret'] !== '') {
        $body = ['showId'=>$showId, 'count'=>min(100,$qty)];
        if ($expiresInDays) $body['expiresInDays'] = $expiresInDays;
        if ($maxDevices) $body['maxDevices'] = $maxDevices;
        $r = live_http('POST', $cfg['api_url'].'/api/integration/codes', $body);
        if (!empty($r['ok']) && !empty($r['data']['codes']) && is_array($r['data']['codes'])) {
            return ['ok'=>true,'codes'=>array_values(array_map('strval',$r['data']['codes'])),'source'=>'live_api'];
        }
        $codes = []; for($i=0;$i<$qty;$i++) $codes[] = live_local_code();
        return ['ok'=>true,'codes'=>$codes,'source'=>'local','error'=>$r['error'] ?? 'live_api_failed'];
    }
    $codes = []; for($i=0;$i<$qty;$i++) $codes[] = live_local_code();
    return ['ok'=>true,'codes'=>$codes,'source'=>'local','error'=>'live_api_not_configured'];
}
function live_type_of(array $event, string $ticketType): ?array {
    $types = (!empty($event['ticketTypes']) && is_array($event['ticketTypes'])) ? $event['ticketTypes'] : default_ticket_types($event);
    foreach ($types as $t) if ((string)($t['id'] ?? '') === $ticketType) return $t;
    return null;
}
function live_dm_message(array $order, ?array $event): string {
    $codes = implode(' , ', array_map('strval', (array)($order['liveCodes'] ?? [])));
    $site = live_config()['site_url'] ?: (string)($order['liveSiteUrl'] ?? '');
    $lines = [
        '🎫 ซื้อบัตรสำเร็จ',
        'งาน: ' . ($order['eventName'] ?? ($event['name'] ?? '-')),
        'ประเภท: ' . ($order['ticketName'] ?? '-') . ' × ' . (int)($order['qty'] ?? 0),
        '',
        '🔴 โค้ดดูไลฟ์ของคุณ (กรอกที่หน้าเว็บดูไลฟ์):',
        '`' . $codes . '`',
    ];
    if ($site !== '') { $lines[] = ''; $lines[] = 'เข้าชมที่: ' . $site; }
    return implode("\n", $lines);
}
/* ส่ง DM หาผู้ใช้ Discord ด้วยบอท (ต้องมี DISCORD_BOT_TOKEN และผู้ใช้ต้องมีเซิร์ฟเวอร์ร่วมกับบอท) */
function discord_bot_dm(string $userId, string $content): array {
    $token = live_config()['bot_token'];
    if ($userId === '') return ['ok'=>false,'error'=>'no_discord_id'];
    if ($token === '') return ['ok'=>false,'error'=>'missing_bot_token'];
    if (!function_exists('curl_init')) return ['ok'=>false,'error'=>'php_curl_missing'];
    $auth = ['Authorization: Bot ' . $token, 'Content-Type: application/json'];
    $ch = curl_init('https://discord.com/api/v10/users/@me/channels');
    curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_HTTPHEADER=>$auth, CURLOPT_POSTFIELDS=>json_encode(['recipient_id'=>$userId]), CURLOPT_TIMEOUT=>12]);
    $raw = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($err) return ['ok'=>false,'error'=>$err];
    $j = json_decode((string)$raw, true);
    if ($status < 200 || $status >= 300 || empty($j['id'])) return ['ok'=>false,'error'=>'open_dm_failed','status'=>$status];
    $channel = (string)$j['id'];
    $ch = curl_init('https://discord.com/api/v10/channels/' . rawurlencode($channel) . '/messages');
    curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_HTTPHEADER=>$auth, CURLOPT_POSTFIELDS=>json_encode(['content'=>$content], JSON_UNESCAPED_UNICODE), CURLOPT_TIMEOUT=>12]);
    $raw = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($err) return ['ok'=>false,'error'=>$err];
    if ($status < 200 || $status >= 300) return ['ok'=>false,'error'=>'send_dm_failed','status'=>$status];
    return ['ok'=>true];
}
function validate_event(array $body, bool $partial=false): array {
    $errors=[]; $clean=[]; $str=fn($v)=>is_string($v)?trim($v):'';
    if(!$partial || array_key_exists('name',$body)){ $clean['name']=$str($body['name']??''); if(!$clean['name']) $errors[]='กรุณาระบุชื่อคอนเสิร์ต'; }
    if(!$partial || array_key_exists('date',$body)){ $clean['date']=$str($body['date']??''); if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$clean['date'])) $errors[]='รูปแบบวันที่ไม่ถูกต้อง'; }
    if(!$partial || array_key_exists('time',$body)){ $clean['time']=$str($body['time']??''); if(!preg_match('/^\d{2}:\d{2}$/',$clean['time'])) $errors[]='รูปแบบเวลาไม่ถูกต้อง'; }
    if(!$partial || array_key_exists('venue',$body)){ $clean['venue']=$str($body['venue']??''); if(!$clean['venue']) $errors[]='กรุณาระบุสถานที่จัดงาน'; }
    if(!$partial || array_key_exists('regular',$body)){ $clean['regular']=(float)($body['regular']??0); if(!is_finite($clean['regular'])||$clean['regular']<0)$errors[]='ราคาบัตรธรรมดาไม่ถูกต้อง'; }
    if(!$partial || array_key_exists('vip',$body)){ $clean['vip']=(float)($body['vip']??0); if(!is_finite($clean['vip'])||$clean['vip']<0)$errors[]='ราคา VIP ไม่ถูกต้อง'; }
    if(!$partial || array_key_exists('status',$body)){ $clean['status']=$str($body['status']??''); if(!in_array($clean['status'],['เปิดขาย','เร็ว ๆ นี้','ปิดการขาย'],true))$errors[]='สถานะไม่ถูกต้อง'; }
    if(array_key_exists('image',$body)) $clean['image']=$str($body['image']);
    if(array_key_exists('limitPerOrder',$body)||!$partial) $clean['limitPerOrder']=max(1,min(100,(int)($body['limitPerOrder']??10)));
    if(array_key_exists('ticketTypes',$body) && ($body['ticketMode']??'')!=='seatmap'){ // โหมดผัง: สร้าง ticketTypes จากโซนด้านล่างแทน
        $types=[]; foreach((array)$body['ticketTypes'] as $i=>$t){ $id=preg_replace('/[^a-z0-9_-]/','',strtolower($str($t['id']??('type-'.($i+1))))) ?: 'type-'.($i+1); $kind=in_array(($t['kind']??'custom'),['regular','live','custom'],true)?$t['kind']:'custom'; $name=$str($t['name']??''); if($name==='')$name=$kind==='live'?'บัตร LIVE':($kind==='regular'?'บัตรธรรมดา':''); $liveShow=preg_replace('/[^A-Za-z0-9_\-]/','',$str($t['liveShowId']??'')); $types[]=['id'=>$id,'name'=>$name,'description'=>$str($t['description']??''),'price'=>(float)($t['price']??0),'kind'=>$kind,'liveShowId'=>$kind==='live'?$liveShow:'']; }
        if(!$types) $errors[]='ต้องมีประเภทบัตรอย่างน้อย 1 ประเภท'; else { foreach($types as $t) if($t['name']===''||!is_finite($t['price'])||$t['price']<0)$errors[]='ข้อมูลประเภทบัตรไม่ครบหรือราคาไม่ถูกต้อง'; if(count(array_unique(array_column($types,'id')))!==count($types))$errors[]='รหัสประเภทบัตรซ้ำกัน'; }
        $clean['ticketTypes']=$types;
    }
    // ---- ticket mode: standing (ยืน) | seatmap (ผัง) ----
    $mode = array_key_exists('ticketMode',$body) ? $str($body['ticketMode']) : ($partial ? null : 'standing');
    if ($mode !== null) {
        if (!in_array($mode,['standing','seatmap'],true)) $errors[]='รูปแบบการกดบัตรไม่ถูกต้อง';
        else {
            $clean['ticketMode']=$mode;
            if ($mode==='standing') $clean['seatMap']=null;
            else {
                if (!array_key_exists('seatMap',$body)) { if(!$partial) $errors[]='กรุณาออกแบบผังที่นั่ง'; }
                else {
                    $sm = normalize_seat_map($body['seatMap'],$errors);
                    if ($sm) {
                        $clean['seatMap']=$sm;
                        $clean['ticketTypes']=array_map(fn($z)=>['id'=>$z['id'],'name'=>$z['name'],'description'=>'โซนที่นั่ง '.$z['name'],'price'=>$z['price'],'kind'=>'custom','liveShowId'=>''],$sm['zones']);
                        $clean['regular']=(float)$sm['zones'][0]['price'];
                        $clean['vip']=(float)($sm['zones'][1]['price'] ?? 0);
                    }
                }
            }
        }
    }
    return [$errors,$clean];
}


/* =========================================================
   SEAT MAP (ผังที่นั่ง)
   seatMap = { rows, cols, rowLabels[], cells[], zones[], stageLabel, stagePos, labelSide,
               stageW, stageH, stageX, stageY, stageAlign }
   stagePos = 'top' | 'bottom' | 'custom' (custom = วางเวทีในผังที่ช่อง/แถวที่กำหนด)
   stageW/H = ขนาดเวที (ช่อง/แถว), stageX/Y = ช่อง/แถวเริ่มต้น (0-based), null = อัตโนมัติ
   cells[r] = string length cols; '0' = ไม่มีที่นั่ง, '1'..'9','a'..'z' = zone index+1 (base36)
   seat id  = rowLabel + (col+1)   เช่น A1, B12
   ========================================================= */
const SEAT_HOLD_SECONDS = 600; // ตรงกับตัวนับเวลา 10 นาทีหน้าเลือกที่นั่ง

/* UTF-8 helpers ที่ไม่ต้องพึ่ง mbstring (host บางที่ไม่ได้เปิดไว้) */
function u_len(string $s): int { return function_exists('mb_strlen') ? mb_strlen($s) : count(preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: []); }
function u_sub(string $s, int $start, int $len): string { if (function_exists('mb_substr')) return mb_substr($s, $start, $len); $a = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: []; return implode('', array_slice($a, $start, $len)); }
function u_lower(string $s): string { return function_exists('mb_strtolower') ? mb_strtolower($s) : strtolower($s); }

function normalize_seat_map($sm, array &$errors): ?array {
    if (!is_array($sm)) { $errors[]='ไม่พบข้อมูลผังที่นั่ง'; return null; }
    $rows=(int)($sm['rows']??0); $cols=(int)($sm['cols']??0);
    if ($rows<1||$rows>60||$cols<1||$cols>80) { $errors[]='ขนาดผังต้องอยู่ระหว่าง 1-60 แถว และ 1-80 คอลัมน์'; return null; }
    $zonesIn = is_array($sm['zones']??null) ? array_values($sm['zones']) : [];
    if (count($zonesIn)<1||count($zonesIn)>12) { $errors[]='ต้องมีโซนที่นั่ง 1-12 โซน'; return null; }
    $zones=[];
    foreach ($zonesIn as $i=>$z) {
        $name=trim((string)($z['name']??'')); $price=(float)($z['price']??0); $color=(string)($z['color']??'');
        if ($name===''||u_len($name)>40) { $errors[]='กรุณาระบุชื่อโซนให้ครบ (ไม่เกิน 40 ตัวอักษร)'; return null; }
        if (!is_finite($price)||$price<0||$price>10000000) { $errors[]='ราคาโซนไม่ถูกต้อง'; return null; }
        if (!preg_match('/^#[0-9a-fA-F]{6}$/',$color)) $color='#facc15';
        $zones[]=['id'=>'z'.($i+1),'name'=>$name,'color'=>strtolower($color),'price'=>$price];
    }
    $labelsIn = is_array($sm['rowLabels']??null) ? array_values($sm['rowLabels']) : [];
    $labels=[]; 
    for ($r=0;$r<$rows;$r++) {
        $l=preg_replace('/[^A-Za-z0-9\x{0E00}-\x{0E7F}]/u','',trim((string)($labelsIn[$r]??'')));
        $l=u_sub($l,0,4);
        if ($l==='') { $errors[]='ชื่อแถวต้องไม่ว่าง (ใช้ตัวอักษร/ตัวเลขเท่านั้น)'; return null; }
        $labels[]=$l;
    }
    if (count(array_unique(array_map('u_lower',$labels)))!==count($labels)) { $errors[]='ชื่อแถวซ้ำกัน'; return null; }
    $cellsIn = is_array($sm['cells']??null) ? array_values($sm['cells']) : [];
    if (count($cellsIn)!==$rows) { $errors[]='ข้อมูลผังไม่ครบทุกแถว'; return null; }
    $cells=[]; $seatCount=0; $maxIdx=count($zones);
    foreach ($cellsIn as $row) {
        $row=(string)$row;
        if (strlen($row)!==$cols||!preg_match('/^[0-9a-z]+$/',$row)) { $errors[]='ข้อมูลผังไม่ถูกต้อง'; return null; }
        foreach (str_split($row) as $ch) { if ($ch==='0') continue; if (intval($ch,36)>$maxIdx) { $errors[]='ข้อมูลโซนในผังไม่ถูกต้อง'; return null; } $seatCount++; }
        $cells[]=$row;
    }
    if ($seatCount<1) { $errors[]='ผังต้องมีที่นั่งอย่างน้อย 1 ที่'; return null; }
    if ($seatCount>3000) { $errors[]='จำนวนที่นั่งสูงสุด 3,000 ที่ต่อผัง'; return null; }
    $stagePos=(string)($sm['stagePos']??'top');
    if (!in_array($stagePos,['top','bottom','custom'],true)) $stagePos='top';
    $side=in_array($sm['labelSide']??'both',['left','right','both'],true)?$sm['labelSide']:'both';
    // ตำแหน่งเวทีแบบกำหนดเอง: เก็บเป็นตัวเลขช่อง/แถว (null = อัตโนมัติ)
    $numCell=function($v,int $min,int $max): ?int {
        if ($v===null||$v===''||!is_numeric($v)) return null;
        $n=(int)$v; if ($n<$min||$n>$max) return null; return $n;
    };
    $stageW=$numCell($sm['stageW']??null,1,$cols);
    $stageH=$numCell($sm['stageH']??null,1,$rows);
    $stageX=$numCell($sm['stageX']??null,0,max(0,$cols-1));
    $stageY=$numCell($sm['stageY']??null,0,max(0,$rows-1));
    $stageAlign=in_array($sm['stageAlign']??'center',['left','center','right'],true)?$sm['stageAlign']:'center';
    // รูปพื้นหลังผัง: ให้แอดมินอัปโหลดแปลน/ผัง แล้ววาดที่นั่งทับ — เก็บเป็น URL เท่านั้น (ไม่ฝัง base64 ใน events.json)
    $bgImage=trim((string)($sm['bgImage']??''));
    if ($bgImage!=='') {
        $bad = u_len($bgImage)>500
            || preg_match('/[<>"\'\s]/', $bgImage)
            || !preg_match('#^(https?://|/|\./)#i', $bgImage)
            || strncasecmp($bgImage,'javascript:',10)===0;
        if ($bad) $bgImage='';
    }
    $bgOpacity=is_numeric($sm['bgOpacity']??null)?(float)$sm['bgOpacity']:0.55;
    $bgOpacity=max(0,min(1,$bgOpacity));
    $bgOpacity=round($bgOpacity,2);
    return ['rows'=>$rows,'cols'=>$cols,'rowLabels'=>$labels,'cells'=>$cells,'zones'=>$zones,
            'stageLabel'=>u_sub(trim((string)($sm['stageLabel']??'STAGE')),0,60),'stagePos'=>$stagePos,'labelSide'=>$side,
            'stageW'=>$stageW,'stageH'=>$stageH,'stageX'=>$stageX,'stageY'=>$stageY,'stageAlign'=>$stageAlign,
            'bgImage'=>$bgImage,'bgOpacity'=>$bgOpacity];
}
function seat_lookup(array $sm): array {
    $out=[];
    foreach ($sm['cells'] as $r=>$row) {
        foreach (str_split($row) as $c=>$ch) {
            if ($ch==='0') continue;
            $z=$sm['zones'][intval($ch,36)-1] ?? null; if(!$z) continue;
            $id=$sm['rowLabels'][$r].($c+1);
            $out[$id]=['id'=>$id,'row'=>$sm['rowLabels'][$r],'col'=>$c+1,'zone'=>$z['id'],'zoneName'=>$z['name'],'price'=>(float)$z['price']];
        }
    }
    return $out;
}
function order_holds_seats(array $o): bool {
    if (empty($o['seats']) || !is_array($o['seats'])) return false;
    if (($o['status']??'')==='cancelled') return false;
    if (is_completed($o)) return true;
    $t=strtotime($o['createdAt']??'') ?: 0;
    return (time()-$t) < SEAT_HOLD_SECONDS + 30;
}
/* คืน [seatId => 'sold'|'held'] ของงานนี้ (ไม่รวมออเดอร์ $exceptOrderId) */
function taken_seats(array $orders, string $eventId, string $exceptOrderId=''): array {
    $taken=[];
    foreach ($orders as $o) {
        if (($o['eventId']??'')!==$eventId || ($o['id']??'')===$exceptOrderId || !order_holds_seats($o)) continue;
        $sold=is_completed($o);
        foreach ($o['seats'] as $s) {
            $id=is_array($s)?(string)($s['id']??''):(string)$s; if($id==='') continue;
            if ($sold) $taken[$id]='sold'; elseif (!isset($taken[$id])) $taken[$id]='held';
        }
    }
    return $taken;
}
/* ล็อกไฟล์ถึงจบ request (flock ถูกปล่อยอัตโนมัติเมื่อสคริปต์จบ) กันสองคนจองที่นั่งเดียวกัน */
function acquire_lock(string $name): void {
    global $DATA; static $handles=[];
    $h=@fopen($DATA.'/'.$name.'.lock','c'); if($h){ flock($h,LOCK_EX); $handles[$name]=$h; }
}
function seat_order(array $event, array $b, string $ordersFile, string $queuesFile, array $user = []): never {
    $eventId=(string)$event['id'];
    $sm=$event['seatMap'] ?? null; if(!is_array($sm)) json_out(['error'=>'no_seatmap','message'=>'งานนี้ยังไม่มีผังที่นั่ง'],400);
    $ids=array_values(array_unique(array_map('strval',(array)($b['seats']??[]))));
    $limit=max(1,min(100,(int)($event['limitPerOrder']??10)));
    if (!$ids) json_out(['error'=>'validation_error','message'=>'กรุณาเลือกที่นั่งอย่างน้อย 1 ที่'],400);
    if (count($ids)>$limit) json_out(['error'=>'limit_exceeded','message'=>"เลือกที่นั่งได้สูงสุด $limit ที่ต่อคำสั่งซื้อ"],400);
    $lookup=seat_lookup($sm); $picked=[];
    foreach ($ids as $id) { if(!isset($lookup[$id])) json_out(['error'=>'invalid_seat','message'=>"ไม่พบที่นั่ง $id"],400); $picked[]=$lookup[$id]; }
    acquire_lock('orders');
    $orders=db_read($ordersFile,[]);
    $taken=taken_seats($orders,$eventId);
    $conflict=array_values(array_filter($ids,fn($id)=>isset($taken[$id])));
    if ($conflict) json_out(['error'=>'seat_taken','message'=>'ที่นั่ง '.implode(', ',$conflict).' ถูกจองไปแล้ว กรุณาเลือกใหม่','seats'=>$conflict],409);
    $queueNumber=0; $qt=clean_str($b['queueToken']??'');
    if ($qt) { cleanup_queues($queuesFile); foreach(db_read($queuesFile,[]) as $q) if(($q['token']??'')===$qt&&($q['eventId']??'')===$eventId){$queueNumber=(int)$q['queueNumber'];break;} }
    if (!$queueNumber) { $max=0; foreach($orders as $o) if(($o['eventId']??'')===$eventId)$max=max($max,(int)($o['queueNumber']??0)); $queueNumber=$max+1; }
    $total=array_sum(array_column($picked,'price')); $qty=count($picked); $now=now_iso();
    $zoneNames=array_values(array_unique(array_column($picked,'zoneName')));
    $order=['id'=>make_id('order'),'ticketNo'=>'GP-'.strtoupper(base_convert((string)round(microtime(true)*1000),10,36)).'-'.strtoupper(bin2hex(random_bytes(3))),
        'queueNumber'=>$queueNumber,'queueCode'=>'#'.str_pad((string)$queueNumber,4,'0',STR_PAD_LEFT),'eventId'=>$eventId,'eventName'=>$event['name'],
        'ticketMode'=>'seatmap','ticketType'=>'seatmap','ticketName'=>implode(' + ',$zoneNames),'ticketDescription'=>'ที่นั่ง '.implode(', ',$ids),
        'seats'=>$picked,'seatLabels'=>implode(', ',$ids),'qty'=>$qty,'unitPrice'=>$qty?round($total/$qty,2):0,'total'=>$total,
        'userId'=>(string)($user['id'] ?? ''),
        'buyer'=>['name'=>'','email'=>'','discord'=>'','roblox'=>''],'createdAt'=>$now,'updatedAt'=>$now];
    $orders[]=$order; db_write($ordersFile,$orders);
    json_out($order,201);
}
/* กันแก้ผัง/โหมดจนกระทบที่นั่งที่ขายไปแล้ว */
function guard_event_update(array $old, array $new, string $ordersFile): void {
    $oldMode=$old['ticketMode']??'standing'; $newMode=$new['ticketMode']??$oldMode; $eid=(string)($old['id']??'');
    $orders=array_values(array_filter(db_read($ordersFile,[]),fn($o)=>($o['eventId']??'')===$eid));
    if ($oldMode!==$newMode && count($orders)>0) json_out(['error'=>'mode_locked','message'=>'งานนี้มีคำสั่งซื้อแล้ว ไม่สามารถเปลี่ยนรูปแบบ ยืน/ผัง ได้'],400);
    if ($newMode==='seatmap' && isset($new['seatMap']) && is_array($new['seatMap'])) {
        $lookup=seat_lookup($new['seatMap']); $missing=[];
        foreach (taken_seats($orders,$eid) as $id=>$st) if(!isset($lookup[$id])) $missing[]=$id;
        if ($missing) json_out(['error'=>'seat_locked','message'=>'ไม่สามารถลบที่นั่งที่ถูกจอง/ขายแล้ว: '.implode(', ',array_slice($missing,0,12))],400);
    }
}

/* ---------- ตั้งค่าเว็บไซต์ (หน้า "ตั้งค่า" ของแอดมิน) ---------- */
function default_settings(): array {
    return [
        'maintenance' => [
            'enabled'       => true,
            'until'         => '2026-10-13T00:00:00+07:00', // เวลาไทย (UTC+7)
            'title'         => 'เว็บไซต์กำลังปิดปรับปรุง',
            'message'       => "เรากำลังอัปเกรดระบบให้ดียิ่งขึ้น\nแล้วพบกันใหม่เร็ว ๆ นี้",
            'note'          => 'ขออภัยในความไม่สะดวก 🙏',
            'showCountdown' => true,
        ],
    ];
}
function normalize_settings($s): array {
    $d = default_settings();
    if (!is_array($s) || !isset($s['maintenance']) || !is_array($s['maintenance'])) return $d;
    $m = $s['maintenance']; $dm = $d['maintenance'];
    $until = trim((string)($m['until'] ?? $dm['until']));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/', $until)) $until = $dm['until'];
    $title = trim((string)($m['title'] ?? ''));
    $msg   = trim((string)($m['message'] ?? ''));
    return ['maintenance' => [
        'enabled'       => !empty($m['enabled']),
        'until'         => $until,
        'title'         => $title !== '' ? u_sub($title, 0, 120) : $dm['title'],
        'message'       => $msg !== '' ? u_sub($msg, 0, 1000) : $dm['message'],
        'note'          => u_sub(trim((string)($m['note'] ?? $dm['note'])), 0, 200),
        'showCountdown' => array_key_exists('showCountdown', $m) ? !empty($m['showCountdown']) : true,
    ]];
}

$eventsFile=$DATA.'/events.json'; $ordersFile=$DATA.'/orders.json'; $queuesFile=$DATA.'/queues.json'; $settingsFile=$DATA.'/settings.json';
if (!is_file($eventsFile)) db_write($eventsFile,[]); if(!is_file($ordersFile))db_write($ordersFile,[]); if(!is_file($queuesFile))db_write($queuesFile,[]); if(!is_file($settingsFile))db_write($settingsFile,default_settings());
$path=request_path(); $m=method();

if ($m==='GET' && $path==='/health') json_out(['ok'=>true,'service'=>'GOPASS PHP','php'=>PHP_VERSION,'timestamp'=>now_iso()]);
if ($m==='GET' && $path==='/settings') { header('Cache-Control: no-store, max-age=0'); json_out(normalize_settings(db_read($settingsFile,default_settings()))); }
if ($m==='GET' && $path==='/') json_out(['ok'=>true,'service'=>'GOPASS API','endpoints'=>['/api/health','/api/events','/api/orders','/api/admin/login']]);

if ($m==='POST' && $path==='/admin/login') {
    $b=body_json(); $a=ensure_admin($ROOT); $u=clean_str($b['username']??''); $p=(string)($b['password']??'');
    if($u===''||$u!==$a['username']||!password_verify($p,$a['passwordHash'])) json_out(['error'=>'invalid_credentials','message'=>'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'],401);
    $token=bin2hex(random_bytes(32)); $sessions=db_read(sessions_file($ROOT),[]); $sessions[]=['token'=>$token,'username'=>$u,'expiresAt'=>time()+SESSION_TTL]; db_write(sessions_file($ROOT),$sessions);
    json_out(['token'=>$token,'username'=>$u]);
}
if ($m==='POST' && $path==='/admin/logout') { $token=auth_token(); if ($token!=='') { db_update(sessions_file($ROOT),function(&$list)use($token){$list=array_values(array_filter($list,fn($x)=>($x['token']??'')!==$token));},[]); } clear_admin_cookie(); json_out(['ok'=>true]); }
if ($m==='GET' && $path==='/admin/me') { $a=require_admin($ROOT); json_out(['username'=>$a['username']]); }

if ($m==='GET' && $path==='/auth/discord') {
    $cfg = discord_config();
    if (!discord_configured()) json_out(['error'=>'discord_not_configured','message'=>'ยังไม่ได้ตั้งค่า Discord Login (ต้องมี DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI)'],503);
    $next = safe_next_path((string)($_GET['next'] ?? ''));
    if ($next !== '') set_login_next($next);
    $state = bin2hex(random_bytes(16));
    set_oauth_state($state);
    $q = http_build_query([
        'client_id'     => $cfg['client_id'],
        'redirect_uri'  => $cfg['redirect_uri'],
        'response_type' => 'code',
        'scope'         => 'identify email',
        'state'         => $state,
        'prompt'        => 'consent',
    ]);
    header('Location: https://discord.com/oauth2/authorize?' . $q, true, 302);
    exit;
}
if ($m==='GET' && $path==='/auth/discord/callback') {
    $cfg = discord_config();
    $saved = (string)($_COOKIE['gopass_oauth_state'] ?? '');
    $code = (string)($_GET['code'] ?? '');
    $state = (string)($_GET['state'] ?? '');
    if (!discord_configured()) discord_login_fail('not_configured');
    if ($code === '') discord_login_fail('missing_code');
    if ($saved === '' || $state === '' || !hash_equals($saved, $state)) discord_login_fail('state_mismatch');
    if (!function_exists('curl_init')) discord_login_fail('curl_missing');
    $ch = curl_init('https://discord.com/api/oauth2/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'client_id'     => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'redirect_uri'  => $cfg['redirect_uri'],
        ]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT    => 15,
    ]);
    $raw = curl_exec($ch);
    $cErr = curl_error($ch);
    $tok = json_decode((string)$raw, true);
    if ($cErr !== '' || !is_array($tok) || empty($tok['access_token'])) discord_login_fail('token_failed');
    $ch2 = curl_init('https://discord.com/api/users/@me');
    curl_setopt_array($ch2, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $tok['access_token']],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $raw2 = curl_exec($ch2);
    $cErr2 = curl_error($ch2);
    $du = json_decode((string)$raw2, true);
    if ($cErr2 !== '' || !is_array($du) || empty($du['id'])) discord_login_fail('profile_failed');
    $did = (string)$du['id'];
    $dname = (string)($du['global_name'] ?? '');
    if ($dname === '') $dname = (string)($du['username'] ?? '');
    $token = bin2hex(random_bytes(32));
    try {
        db_update(user_sessions_file($ROOT), function (&$list) use ($token, $du, $did, $dname) {
            $list = array_values(array_filter($list, fn($x) => ($x['id'] ?? '') !== $did));
            $list[] = [
                'token'       => $token,
                'id'          => $did,
                'username'    => (string)($du['username'] ?? ''),
                'displayName' => $dname,
                'avatar'      => (string)($du['avatar'] ?? ''),
                'email'       => (string)($du['email'] ?? ''),
                'expiresAt'   => time() + SESSION_TTL,
            ];
        }, []);
    } catch (Throwable $e) {
        error_log('[gopass] discord session write failed: ' . $e->getMessage());
        discord_login_fail('storage_failed');
    }
    set_user_cookie($token);
    clear_oauth_state();
    $next = safe_next_path((string)($_COOKIE['gopass_login_next'] ?? ''));
    clear_login_next();
    header('Location: ' . ($next !== '' ? $next : '/'), true, 302);
    exit;
}
if ($m==='GET' && $path==='/auth/me') {
    $u = current_user($ROOT);
    // `storage` is a deployment health signal, not user data: a false here is
    // the one thing that makes a successful login look like a failed one.
    json_out(['user' => $u, 'storage' => storage_ok($DATA) ? 'ok' : 'read-only']);
}
/* ประวัติการกดบัตรของผู้ใช้ที่ล็อกอินอยู่ (เฉพาะของตัวเองเท่านั้น) */
if ($m==='GET' && $path==='/auth/orders') {
    $u = require_user($ROOT);
    $uid = (string)($u['id'] ?? '');
    $uname = strtolower((string)($u['username'] ?? ''));
    $events = db_read($eventsFile, []);
    $map = [];
    foreach ($events as $ev) if (!empty($ev['id'])) $map[(string)$ev['id']] = $ev;
    $mine = [];
    foreach (db_read($ordersFile, []) as $o) {
        $owner = (string)($o['userId'] ?? '');
        if ($uid !== '' && $owner === $uid) { $mine[] = $o; continue; }
        // คำสั่งซื้อที่สร้างก่อนมีระบบผูกบัญชี: เทียบชื่อ Discord ของผู้ซื้อแทน
        if ($owner === '' && $uname !== '' && strtolower((string)($o['buyer']['discord'] ?? '')) === $uname) $mine[] = $o;
    }
    usort($mine, fn($a, $b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));
    $out = [];
    foreach ($mine as $o) {
        $ev = $map[(string)($o['eventId'] ?? '')] ?? null;
        $out[] = [
            'id'          => $o['id'] ?? '',
            'ticketNo'    => $o['ticketNo'] ?? '',
            'queueCode'   => $o['queueCode'] ?? '',
            'eventId'     => $o['eventId'] ?? '',
            'eventName'   => $o['eventName'] ?? ($ev['name'] ?? ''),
            'eventDate'   => $ev['date'] ?? '',
            'eventTime'   => $ev['time'] ?? '',
            'eventVenue'  => $ev['venue'] ?? '',
            'eventImage'  => $ev['image'] ?? '',
            'ticketName'  => $o['ticketName'] ?? ($o['ticketType'] ?? ''),
            'seatLabels'  => $o['seatLabels'] ?? '',
            'qty'         => (int)($o['qty'] ?? 0),
            'unitPrice'   => (float)($o['unitPrice'] ?? 0),
            'total'       => (float)($o['total'] ?? 0),
            'status'      => empty($o['buyer']['email']) ? 'pending' : 'completed',
            'checkedInAt' => $o['checkedInAt'] ?? '',
            'createdAt'   => $o['createdAt'] ?? '',
            'liveCodes'   => $o['liveCodes'] ?? [],
            'liveShowId'  => $o['liveShowId'] ?? '',
            'liveSiteUrl' => $o['liveSiteUrl'] ?? '',
            'liveIssuedAt'=> $o['liveIssuedAt'] ?? '',
            'liveDmSentAt'=> $o['liveDmSentAt'] ?? '',
        ];
    }
    json_out($out);
}
if ($m==='POST' && $path==='/auth/logout') {
    $t = user_token();
    if ($t !== '') {
        try {
            db_update(user_sessions_file($ROOT), function (&$list) use ($t) { $list = array_values(array_filter($list, fn($x) => ($x['token'] ?? '') !== $t)); }, []);
        } catch (Throwable $e) { error_log('[gopass] user logout cleanup failed: ' . $e->getMessage()); }
    }
    clear_user_cookie();
    json_out(['ok' => true]);
}

if ($m==='GET' && $path==='/events') { $list=db_read($eventsFile,[]); usort($list,fn($a,$b)=>strcmp($a['date']??'',$b['date']??'')); json_out(array_map('public_event',$list)); }
if ($m==='GET' && preg_match('#^/events/([^/]+)/seats$#',$path,$mm)) {
    $id=urldecode($mm[1]); $ev=null; foreach(db_read($eventsFile,[]) as $x){if(($x['id']??'')===$id){$ev=$x;break;}}
    if(!$ev) json_out(['error'=>'not_found','message'=>'ไม่พบงานนี้'],404);
    $sold=[];$held=[]; foreach(taken_seats(db_read($ordersFile,[]),$id) as $sid=>$st){ if($st==='sold')$sold[]=$sid; else $held[]=$sid; }
    json_out(['sold'=>$sold,'held'=>$held,'serverTime'=>now_iso()]);
}
if (preg_match('#^/events/([^/]+)$#',$path,$mm)) {
    $id=urldecode($mm[1]); $list=db_read($eventsFile,[]); $e=null; foreach($list as $x){if(($x['id']??'')===$id){$e=$x;break;}} if(!$e)json_out(['error'=>'not_found','message'=>'ไม่พบงานนี้'],404);
    if($m==='GET') json_out(public_event($e));
    $a=require_admin($ROOT);
    if($m==='DELETE'){ $list=array_values(array_filter($list,fn($x)=>($x['id']??'')!==$id)); db_write($eventsFile,$list); json_out(['ok'=>true]); }
    if($m==='PUT'){ [$errors,$clean]=validate_event(body_json(),true); if($errors)json_out(['error'=>'validation_error','message'=>implode(', ',$errors)],400); foreach($list as $i=>$x)if(($x['id']??'')===$id){guard_event_update($x,$clean,$ordersFile);$merged=array_merge($x,$clean,['updatedAt'=>now_iso()]);if(empty($merged['ticketTypes']))$merged['ticketTypes']=default_ticket_types($merged);$list[$i]=$merged;db_write($eventsFile,$list);json_out(public_event($merged));} }
}
if ($m==='POST' && $path==='/events') { require_admin($ROOT); [$errors,$clean]=validate_event(body_json()); if($errors)json_out(['error'=>'validation_error','message'=>implode(', ',$errors)],400); $now=now_iso(); $item=array_merge(['id'=>make_id('event'),'image'=>'','createdAt'=>$now,'updatedAt'=>$now],$clean);if(empty($item['ticketTypes']))$item['ticketTypes']=default_ticket_types($item);db_update($eventsFile,function(&$list)use($item){$list[]=$item;},[]);json_out(public_event($item),201); }

if ($m==='POST' && $path==='/upload') {
    require_admin($ROOT);
    if(empty($_FILES['poster']) || ($_FILES['poster']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) json_out(['error'=>'upload_failed','message'=>'ไม่พบไฟล์รูปภาพ'],400);
    $f=$_FILES['poster']; if(($f['size']??0)>MAX_UPLOAD)json_out(['error'=>'upload_failed','message'=>'ไฟล์ใหญ่เกิน 5MB'],400);
    // ตรวจชนิดไฟล์จากเนื้อหาจริง: ใช้ finfo ถ้ามี ไม่งั้น fallback ด้วย getimagesize (มีใน PHP มาตรฐานเสมอ)
    $mime='';
    if(function_exists('finfo')){ try{ $mime=(string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']); }catch(Throwable $e){ $mime=''; } }
    $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif'];
    if(!isset($allowed[$mime])){ $info=@getimagesize($f['tmp_name']); if(is_array($info)&&!empty($info['mime']))$mime=(string)$info['mime']; }
    if(!isset($allowed[$mime]))json_out(['error'=>'upload_failed','message'=>'รองรับเฉพาะ JPG, PNG, WEBP, GIF เท่านั้น'],400);
    $name=bin2hex(random_bytes(16)).'.'.$allowed[$mime]; if(!move_uploaded_file($f['tmp_name'],$UPLOADS.'/'.$name))json_out(['error'=>'upload_failed','message'=>'บันทึกไฟล์ไม่ได้'],500); json_out(['url'=>'/uploads/'.$name]);
}

if (preg_match('#^/queue/([^/]+)$#',$path,$mm) && $m==='GET') { $eventId=urldecode($mm[1]); $e=null;foreach(db_read($eventsFile,[]) as $x)if(($x['id']??'')===$eventId){$e=$x;break;}if(!$e)json_out(['error'=>'not_found','message'=>'ไม่พบงานนี้'],404);if(($e['status']??'')!=='เปิดขาย')json_out(['error'=>'not_on_sale','message'=>'งานนี้ยังไม่เปิดขาย'],400);cleanup_queues($queuesFile);$token=clean_str($_GET['token']??'');$list=db_read($queuesFile,[]);$result=null;if($token)foreach($list as $q)if(($q['token']??'')===$token&&($q['eventId']??'')===$eventId){$result=$q;break;}if(!$result){$max=0;foreach($list as $q)if(($q['eventId']??'')===$eventId)$max=max($max,(int)($q['queueNumber']??0));$n=$max+1;$result=['token'=>bin2hex(random_bytes(18)),'eventId'=>$eventId,'queueNumber'=>$n,'queueCode'=>'#'.str_pad((string)$n,4,'0',STR_PAD_LEFT),'createdAt'=>now_iso()];$list[]=$result;db_write($queuesFile,$list);}json_out(['queueCode'=>$result['queueCode'],'queueNumber'=>$result['queueNumber'],'ahead'=>max(0,(int)$result['queueNumber']-1),'token'=>$result['token']]); }

if($m==='POST' && $path==='/orders'){
    $user=require_user($ROOT);
    $b=body_json();$eventId=clean_str($b['eventId']??'');$ticketType=clean_str($b['ticketType']??'');$qty=max(1,(int)($b['qty']??1));$price=(float)($b['price']??0);$event=null;foreach(db_read($eventsFile,[]) as $e)if(($e['id']??'')===$eventId){$event=$e;break;}if(!$event)json_out(['error'=>'not_found','message'=>'ไม่พบงานนี้'],404);if(($event['status']??'')!=='เปิดขาย')json_out(['error'=>'not_on_sale','message'=>'งานนี้ยังไม่เปิดขายหรือปิดการขายแล้ว'],400);if(($event['ticketMode']??'standing')==='seatmap')seat_order($event,$b,$ordersFile,$queuesFile,$user);$types=!empty($event['ticketTypes'])?$event['ticketTypes']:default_ticket_types($event);$type=null;foreach($types as $t)if(($t['id']??'')===$ticketType){$type=$t;break;}if(!$type)json_out(['error'=>'invalid_ticket_type','message'=>'ไม่พบประเภทบัตรนี้'],400);$limit=max(1,min(100,(int)($event['limitPerOrder']??10)));$qty=min($limit,$qty);$expected=(float)($type['price']??0);if(is_finite($price)&&abs($price-$expected)>0.00001)json_out(['error'=>'price_mismatch','message'=>'ราคาบัตรเปลี่ยนแปลง กรุณาโหลดรายการใหม่'],400);$queueNumber=0;$qt=clean_str($b['queueToken']??'');$queues=db_read($queuesFile,[]);if($qt){cleanup_queues($queuesFile);foreach(db_read($queuesFile,[]) as $q)if(($q['token']??'')===$qt&&($q['eventId']??'')===$eventId){$queueNumber=(int)$q['queueNumber'];break;}}$orders=db_read($ordersFile,[]);if(!$queueNumber){$max=0;foreach($orders as $o)if(($o['eventId']??'')===$eventId)$max=max($max,(int)($o['queueNumber']??0));$queueNumber=$max+1;} $now=now_iso();$order=['id'=>make_id('order'),'ticketNo'=>'GP-'.strtoupper(base_convert((string)round(microtime(true)*1000),10,36)).'-'.strtoupper(bin2hex(random_bytes(3))),'queueNumber'=>$queueNumber,'queueCode'=>'#'.str_pad((string)$queueNumber,4,'0',STR_PAD_LEFT),'eventId'=>$eventId,'eventName'=>$event['name'],'ticketType'=>$type['id'],'ticketName'=>$type['name'],'ticketDescription'=>$type['description']??'','qty'=>$qty,'unitPrice'=>$expected,'total'=>$qty*$expected,'userId'=>(string)($user['id']??''),'buyer'=>['name'=>'','email'=>'','discord'=>'','roblox'=>''],'createdAt'=>$now,'updatedAt'=>$now];$orders[]=$order;db_write($ordersFile,$orders);json_out($order,201);
}
if(preg_match('#^/orders/([^/]+)(/sync-sheet)?$#',$path,$mm)){
    if($m==='PUT')acquire_lock('orders');$id=urldecode($mm[1]);$isSync=isset($mm[2])&&$mm[2]==='/sync-sheet';$orders=db_read($ordersFile,[]);$idx=null;foreach($orders as $i=>$o)if(($o['id']??'')===$id){$idx=$i;break;}if($idx===null)json_out(['error'=>'not_found','message'=>'ไม่พบคำสั่งซื้อ'],404);
    // ต้องล็อกอินและเป็นเจ้าของคำสั่งซื้อ (หรือเป็นแอดมิน) เท่านั้น ถึงจะดู/แก้ไขได้
    if(!current_admin($ROOT)){ $u=require_user($ROOT); if(!order_belongs_to($orders[$idx],$u)) json_out(['error'=>'forbidden','message'=>'รายการนี้ไม่ใช่ของคุณ กรุณาเข้าสู่ระบบด้วยบัญชีที่ใช้กดบัตร'],403); }
    if($isSync && $m==='POST'){ $o=$orders[$idx]; if(empty($o['buyer']['email']))json_out(['ok'=>false,'error'=>'buyer_incomplete','message'=>'ยังไม่มีข้อมูลผู้ซื้อ'],400);$r=google_sheet($ROOT,$o);if(!$r['ok'])json_out(['ok'=>false,'googleSheet'=>$r],502);json_out(['ok'=>true,'googleSheet'=>$r]); }
    if(!$isSync && $m==='GET') json_out($orders[$idx]);
    if(!$isSync && $m==='PUT'){ $b=body_json();$name=clean_str($b['name']??$b['fullName']??'');$email=clean_str($b['email']??'');$discord=clean_str($b['discord']??'');$roblox=clean_str($b['roblox']??'');if(strlen($name)<2||strlen($name)>100)json_out(['error'=>'validation_error','message'=>'กรุณาระบุชื่อผู้ซื้อ 2-100 ตัวอักษร'],400);if(!filter_var($email,FILTER_VALIDATE_EMAIL))json_out(['error'=>'validation_error','message'=>'กรุณาระบุอีเมลที่ถูกต้อง'],400);if(!preg_match('/^[A-Za-z0-9._-]{2,50}$/',$discord))json_out(['error'=>'validation_error','message'=>'Discord ต้องใช้ภาษาอังกฤษ ตัวเลข และ . _ - เท่านั้น'],400);if(!preg_match('/^[A-Za-z0-9_]{3,30}$/',$roblox))json_out(['error'=>'validation_error','message'=>'Roblox ต้องใช้ภาษาอังกฤษ ตัวเลข และ _ เท่านั้น'],400);if(!empty($orders[$idx]['seats'])&&!is_completed($orders[$idx])){$tk=taken_seats($orders,(string)($orders[$idx]['eventId']??''),(string)$orders[$idx]['id']);$lost=[];foreach($orders[$idx]['seats'] as $sx){$sid=(string)($sx['id']??'');if(isset($tk[$sid]))$lost[]=$sid;}if($lost)json_out(['error'=>'seat_taken','message'=>'หมดเวลาจองและที่นั่ง '.implode(', ',$lost).' ถูกคนอื่นจองไปแล้ว กรุณาเลือกที่นั่งใหม่','seats'=>$lost],409);}$orders[$idx]['buyer']=['name'=>$name,'email'=>$email,'discord'=>$discord,'roblox'=>$roblox];$orders[$idx]['status']='completed';$orders[$idx]['updatedAt']=now_iso();
    // ---- บัตร LIVE: ออกโค้ดดูไลฟ์อัตโนมัติ (1 โค้ด/1 บัตร) + ส่ง Discord DM ----
    $evt=null; foreach(db_read($eventsFile,[]) as $ex) if((string)($ex['id']??'')===(string)($orders[$idx]['eventId']??'')){$evt=$ex;break;}
    $liveType=$evt?live_type_of($evt,(string)($orders[$idx]['ticketType']??'')):null;
    if($liveType && ($liveType['kind']??'')==='live'){ $cfg=live_config(); $qty=max(1,(int)($orders[$idx]['qty']??1));
        if(empty($orders[$idx]['liveCodes'])){ $gen=live_generate_codes($qty,(string)($liveType['liveShowId']??'ALL')); $orders[$idx]['liveCodes']=$gen['codes']; $orders[$idx]['liveSource']=$gen['source']??'local'; $orders[$idx]['liveShowId']=(string)($liveType['liveShowId']??''); $orders[$idx]['liveSiteUrl']=$cfg['site_url']; $orders[$idx]['liveIssuedAt']=now_iso(); if(!empty($gen['error']))$orders[$idx]['liveError']=$gen['error']; }
        if(empty($orders[$idx]['liveDmSentAt']) && !empty($orders[$idx]['liveCodes'])){ $dm=discord_bot_dm((string)($orders[$idx]['userId']??''),live_dm_message($orders[$idx],$evt)); $orders[$idx]['liveDm']=$dm; if(!empty($dm['ok']))$orders[$idx]['liveDmSentAt']=now_iso(); }
    }
    db_write($ordersFile,$orders);$o=$orders[$idx];$sheet=google_sheet($ROOT,$o);$disc=discord_webhook($o);json_out(array_merge($o,['googleSheet'=>$sheet,'discord'=>$disc]));}
}

if($m==='GET'&&$path==='/admin/orders'){require_admin($ROOT);$events=db_read($eventsFile,[]);$map=[];foreach($events as $e)$map[$e['id']]=$e['name'];$orders=array_reverse(db_read($ordersFile,[]));foreach($orders as &$o)$o['eventName']=$map[$o['eventId']??'']??($o['eventName']??'');json_out($orders);}
if($m==='GET'&&$path==='/admin/customers'){require_admin($ROOT);$map=[];foreach(db_read($ordersFile,[]) as $o){$b=$o['buyer']??[];$key=$b['email']??$b['discord']??$b['roblox']??$o['id'];if(!isset($map[$key]))$map[$key]=['name'=>$b['name']??'-','email'=>$b['email']??'-','discord'=>$b['discord']??'-','roblox'=>$b['roblox']??'-','orders'=>0,'tickets'=>0,'total'=>0,'lastOrderAt'=>$o['createdAt']??now_iso()];foreach(['name','email','discord','roblox'] as $k)if(!empty($b[$k]))$map[$key][$k]=$b[$k];$map[$key]['orders']++;$map[$key]['tickets']+=(int)($o['qty']??0);$map[$key]['total']+=(float)($o['total']??0);if(($o['createdAt']??'')>$map[$key]['lastOrderAt'])$map[$key]['lastOrderAt']=$o['createdAt'];} $out=array_values($map);usort($out,fn($a,$b)=>strtotime($b['lastOrderAt'])<=>strtotime($a['lastOrderAt']));json_out($out);}
if($m==='POST'&&$path==='/admin/checkin'){ $a=require_admin($ROOT);$b=body_json();$ticket=clean_str($b['ticketNo']??$b['queueCode']??'');$eventId=clean_str($b['eventId']??'');if($ticket==='')json_out(['error'=>'validation_error','message'=>'กรุณากรอกเลขบัตร / เลขรายการ'],400);$orders=db_read($ordersFile,[]);$idx=null;foreach($orders as $i=>$o){$cand=array_values(array_filter([$o['ticketNo']??null,$o['ticketNumber']??null,$o['id']??null,$o['queueCode']??null]));if(in_array($ticket,$cand,true)&&($eventId===''||(string)($o['eventId']??'')===$eventId)){$idx=$i;break;}}if($idx===null)json_out(['error'=>'not_found','message'=>'ไม่พบรายการบัตรนี้'],404);$o=$orders[$idx];if(empty($o['buyer']['email']))json_out(['error'=>'incomplete','message'=>'รายการนี้ยังกรอกข้อมูลผู้ซื้อไม่ครบ','order'=>$o],409);if(!empty($o['checkedInAt']))json_out(['error'=>'already_checked_in','message'=>'บัตรนี้เช็กอินไปแล้ว','order'=>$o],409);$now=now_iso();$orders[$idx]['checkedInAt']=$now;$orders[$idx]['checkedInBy']=$a['username'];$orders[$idx]['checkInStatus']='checked_in';$orders[$idx]['updatedAt']=$now;db_write($ordersFile,$orders);json_out(['ok'=>true,'message'=>'เช็กอินสำเร็จ','order'=>$orders[$idx]]);}
if($m==='GET'&&$path==='/admin/checkins'){require_admin($ROOT);$eventId=clean_str($_GET['eventId']??'');$out=array_values(array_filter(db_read($ordersFile,[]),fn($o)=>(!$eventId||(string)($o['eventId']??'')===$eventId)&&!empty($o['checkedInAt'])));usort($out,fn($a,$b)=>strtotime($b['checkedInAt'])<=>strtotime($a['checkedInAt']));json_out($out);}
if(preg_match('#^/admin/event-report/([^/]+)$#',$path,$mm)&&$m==='GET'){require_admin($ROOT);$id=urldecode($mm[1]);$event=null;foreach(db_read($eventsFile,[]) as $e)if(($e['id']??'')===$id){$event=$e;break;}if(!$event)json_out(['error'=>'not_found','message'=>'ไม่พบงานนี้'],404);$orders=array_values(array_filter(db_read($ordersFile,[]),fn($o)=>($o['eventId']??'')===$id));$completed=array_values(array_filter($orders,'is_completed'));$checked=array_values(array_filter($completed,fn($o)=>!empty($o['checkedInAt'])));$ticket=[];foreach($completed as $o){$k=$o['ticketName']??$o['ticketType']??'ไม่ระบุ';if(!isset($ticket[$k]))$ticket[$k]=['name'=>$k,'orders'=>0,'tickets'=>0,'revenue'=>0,'checkedIn'=>0];$ticket[$k]['orders']++;$ticket[$k]['tickets']+=(int)($o['qty']??0);$ticket[$k]['revenue']+=(float)($o['total']??0);if(!empty($o['checkedInAt']))$ticket[$k]['checkedIn']+=(int)($o['qty']??0);} $totalTickets=array_sum(array_map(fn($o)=>(int)($o['qty']??0),$completed));$checkedTickets=array_sum(array_map(fn($o)=>(int)($o['qty']??0),$checked));usort($completed,fn($a,$b)=>strtotime($b['createdAt'])<=>strtotime($a['createdAt']));usort($checked,fn($a,$b)=>strtotime($b['checkedInAt'])<=>strtotime($a['checkedInAt']));$ordersView=array_map(fn($o)=>['id'=>$o['id']??'','ticketNo'=>$o['ticketNo']??'','queueCode'=>$o['queueCode']??'','createdAt'=>$o['createdAt']??'','updatedAt'=>$o['updatedAt']??'','status'=>$o['status']??'completed','checkedInAt'=>$o['checkedInAt']??'','eventName'=>$o['eventName']??$event['name'],'ticketName'=>$o['ticketName']??$o['ticketType']??'-','qty'=>(int)($o['qty']??0),'seatLabels'=>$o['seatLabels']??'','unitPrice'=>(float)($o['unitPrice']??0),'total'=>(float)($o['total']??0),'buyer'=>$o['buyer']??[]],$completed);json_out(['generatedAt'=>now_iso(),'event'=>public_event($event),'summary'=>['orders'=>count($completed),'tickets'=>$totalTickets,'checkedInOrders'=>count($checked),'checkedInTickets'=>$checkedTickets,'pendingOrders'=>max(0,count($completed)-count($checked)),'pendingTickets'=>max(0,$totalTickets-$checkedTickets),'revenue'=>array_sum(array_map(fn($o)=>(float)($o['total']??0),$completed))],'ticketTypes'=>array_values($ticket),'orders'=>$ordersView,'checkins'=>$checked]);}
if($m==='GET'&&$path==='/admin/settings'){require_admin($ROOT);json_out(normalize_settings(db_read($settingsFile,default_settings())));}
if($m==='PUT'&&$path==='/admin/settings'){require_admin($ROOT);$clean=normalize_settings(body_json());db_write($settingsFile,$clean);json_out($clean);}
if($m==='GET'&&$path==='/admin/stats'){require_admin($ROOT);$events=array_map('public_event',db_read($eventsFile,[]));$all=db_read($ordersFile,[]);$orders=array_values(array_filter($all,'is_completed'));$rev=array_sum(array_map(fn($o)=>(float)($o['total']??0),$orders));$tickets=array_sum(array_map(fn($o)=>(int)($o['qty']??0),$orders));$per=[];foreach($events as $e){$eo=array_values(array_filter($orders,fn($o)=>($o['eventId']??'')===$e['id']));$per[]=['id'=>$e['id'],'name'=>$e['name'],'image'=>$e['image']??'','status'=>$e['status'],'ticketsSold'=>array_sum(array_map(fn($o)=>(int)($o['qty']??0),$eo)),'revenue'=>array_sum(array_map(fn($o)=>(float)($o['total']??0),$eo)),'orders'=>count($eo)];}usort($per,fn($a,$b)=>$b['revenue']<=>$a['revenue']);$recent=array_reverse($orders);$recent=array_slice($recent,0,8);json_out(['totalEvents'=>count($events),'onSale'=>count(array_filter($events,fn($e)=>$e['status']==='เปิดขาย')),'upcoming'=>count(array_filter($events,fn($e)=>$e['status']==='เร็ว ๆ นี้')),'totalOrders'=>count($orders),'totalTickets'=>$tickets,'totalRevenue'=>$rev,'perEvent'=>$per,'recentOrders'=>$recent]);}
if($m==='GET'&&$path==='/admin/live-shows'){ require_admin($ROOT); $cfg=live_config(); if($cfg['api_url']===''||$cfg['secret']==='') json_out(['ok'=>false,'configured'=>false,'error'=>'live_api_not_configured','shows'=>[],'siteUrl'=>$cfg['site_url']]); $r=live_http('GET',$cfg['api_url'].'/api/integration/shows'); if(empty($r['ok'])) json_out(['ok'=>false,'configured'=>true,'error'=>$r['error']??'live_api_error','shows'=>[],'siteUrl'=>$cfg['site_url']]); $shows=is_array($r['data']['shows']??null)?$r['data']['shows']:[]; json_out(['ok'=>true,'configured'=>true,'shows'=>$shows,'siteUrl'=>$cfg['site_url']]); }
if($m==='GET'&&$path==='/google-sheet/health'){require_admin($ROOT);$url=getenv('GOOGLE_SHEET_WEBHOOK_URL')?:($GLOBALS['GOPASS_CONFIG']['google_sheet_webhook_url']??'');$secret=getenv('GOOGLE_SHEET_SECRET')?:($GLOBALS['GOPASS_CONFIG']['google_sheet_secret']??'');if($url===''||$secret==='')json_out(['ok'=>false,'error'=>'missing_google_sheet_config'],503);if(!function_exists('curl_init'))json_out(['ok'=>false,'error'=>'php_curl_missing'],503);$ch=curl_init($url);curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10]);    $body=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$err=curl_error($ch);if($err)json_out(['ok'=>false,'error'=>$err],502);$result=json_decode((string)$body,true);json_out(['ok'=>$status>=200&&$status<300,'status'=>$status,'google'=>$result??substr((string)$body,0,500)],$status>=200&&$status<300?200:502);}

json_out(['error'=>'not_found','message'=>'ไม่พบ endpoint นี้'],404);
