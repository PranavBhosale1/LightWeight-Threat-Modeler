<?php
require_once __DIR__ . '/db.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /dashboard.php');
    exit;
}

$uid      = (int)$_SESSION['uid'];
$destDir  = __DIR__ . '/uploads/';
$origName = $_FILES['photo']['name'];
$target   = $destDir . $origName;

if (!move_uploaded_file($_FILES['photo']['tmp_name'], $target)) {
    die('Upload failed.');
}

$rel = 'uploads/' . $origName;
$db->query("UPDATE employees SET photo = '$rel' WHERE id = $uid");

header('Location: /dashboard.php');
