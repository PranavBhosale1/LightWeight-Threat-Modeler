<?php
// JSON search endpoint used by the manager UI's typeahead.
// Returns name + department + salary for any matching employees.

require_once __DIR__ . '/../db.php';
require_login();

header('Content-Type: application/json');

$q    = isset($_GET['q']) ? $_GET['q'] : '';
$sort = isset($_GET['sort']) ? $_GET['sort'] : 'id';

$sql = "SELECT id, full_name, department, salary
        FROM employees
        WHERE full_name LIKE '%$q%'
        ORDER BY $sort
        LIMIT 50";

$res = $db->query($sql);

$rows = [];
while ($res && $row = $res->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode($rows);
