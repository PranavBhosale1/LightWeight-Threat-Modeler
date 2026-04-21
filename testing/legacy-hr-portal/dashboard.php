<?php
require_once __DIR__ . '/db.php';
require_login();

$me = current_user($db);

// Classic shortcut: the admin panel is behind a URL flag.
$showAdmin = isset($_GET['admin']) && $_GET['admin'] == '1';

// Managers can look at any employee by id.
$viewId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : $me['id'];
$res = $db->query("SELECT * FROM employees WHERE id = $viewId");
$employee = $res ? $res->fetch_assoc() : null;
?>
<!DOCTYPE html>
<html>
<head>
    <title>HR Portal — Dashboard</title>
</head>
<body>
    <h2>Welcome, <?php echo $me['username']; ?></h2>

    <?php if ($employee): ?>
        <h3>Employee #<?php echo $employee['id']; ?>: <?php echo $employee['full_name']; ?></h3>
        <p>Department: <?php echo $employee['department']; ?></p>
        <p>Salary: $<?php echo $employee['salary']; ?></p>
        <p><a href="/uploads/<?php echo $employee['photo']; ?>">Photo</a></p>
        <p><a href="/uploads/payslips/<?php echo $employee['latest_payslip']; ?>">Download latest payslip</a></p>
    <?php endif; ?>

    <?php if ($showAdmin): ?>
        <h3>Admin tools</h3>
        <ul>
            <li><a href="/admin/reset_password.php">Reset a password</a></li>
            <li><a href="/admin/export_now.php">Trigger payroll export</a></li>
        </ul>
    <?php endif; ?>

    <form method="post" action="/upload.php" enctype="multipart/form-data">
        <label>Update profile photo:</label>
        <input type="file" name="photo">
        <button type="submit">Upload</button>
    </form>
</body>
</html>
