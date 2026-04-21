<?php
require_once __DIR__ . '/db.php';

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = $_POST['username'];
    $pass = md5($_POST['password']);

    $sql = "SELECT id, is_admin FROM users WHERE username = '$user' AND password = '$pass'";
    $res = $db->query($sql);

    if ($res && $row = $res->fetch_assoc()) {
        $_SESSION['uid']   = $row['id'];
        $_SESSION['admin'] = (int)$row['is_admin'];
        header('Location: /dashboard.php');
        exit;
    } else {
        $error = 'Invalid username or password.';
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <title>HR Portal — Sign in</title>
    <link rel="stylesheet" href="/vendor/bootstrap3/bootstrap.min.css">
</head>
<body>
    <div class="container">
        <h2>HR Portal</h2>
        <?php if ($error): ?>
            <div class="alert alert-danger"><?php echo $error; ?></div>
        <?php endif; ?>
        <form method="post">
            <input type="text" name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Sign in</button>
        </form>
        <p><a href="/reset.php">Forgot password?</a></p>
    </div>
</body>
</html>
