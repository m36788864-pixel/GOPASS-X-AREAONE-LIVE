<?php
// PHP built-in server router for local testing.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (str_starts_with($path, '/api')) {
    $_GET['route'] = substr($path, 4) ?: '/';
    require __DIR__ . '/api/index.php';
    exit;
}
if ($path !== '/' && is_file(__DIR__ . $path)) return false;
if ($path === '/admin') { require __DIR__ . '/admin/login.html'; exit; }
if ($path === '/admin/') { require __DIR__ . '/admin/login.html'; exit; }
require __DIR__ . '/index.html';
