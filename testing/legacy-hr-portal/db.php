<?php
// Shared DB + session bootstrap for the HR portal.
// Included at the top of every page.

$cfg = parse_ini_file(__DIR__ . '/config/settings.ini', true);

$db = new mysqli(
    $cfg['database']['host'],
    $cfg['database']['user'],
    $cfg['database']['pass'],
    $cfg['database']['name'],
    (int)$cfg['database']['port']
);

if ($db->connect_errno) {
    die("DB connection failed: " . $db->connect_error);
}

session_start();

function current_user($db) {
    if (!isset($_SESSION['uid'])) return null;
    $uid = (int)$_SESSION['uid'];
    $res = $db->query("SELECT id, username, is_admin, department FROM users WHERE id = $uid");
    return $res ? $res->fetch_assoc() : null;
}

function require_login() {
    if (!isset($_SESSION['uid'])) {
        header('Location: /index.php');
        exit;
    }
}
