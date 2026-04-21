<?php
// Runs nightly from crontab:
//   0 2 * * * /usr/bin/php /var/www/hr/cron/export_payroll.php
//
// Dumps the full payroll for the month to a CSV file under uploads/
// and emails a copy to finance as an attachment.

require_once __DIR__ . '/../db.php';
require 'PHPMailerAutoload.php';

$cfg = parse_ini_file(__DIR__ . '/../config/settings.ini', true);

$outFile = $cfg['admin']['payroll_export_dir'] . '/payroll_' . date('Y_m') . '.csv';
$fp = fopen($outFile, 'w');

fputcsv($fp, ['id', 'full_name', 'ssn', 'department', 'salary', 'bank_account']);

$res = $db->query("SELECT id, full_name, ssn, department, salary, bank_account FROM employees");
while ($row = $res->fetch_assoc()) {
    fputcsv($fp, $row);
}
fclose($fp);

$mail = new PHPMailer();
$mail->isSMTP();
$mail->Host = $cfg['smtp']['host'];
$mail->Port = (int)$cfg['smtp']['port'];
$mail->SMTPAutoTLS = false;
$mail->SMTPSecure = '';
$mail->setFrom($cfg['smtp']['from'], 'HR Portal');
$mail->addAddress('finance@corp.internal');
$mail->Subject = 'Monthly payroll export';
$mail->Body    = 'Attached is the monthly payroll export.';
$mail->addAttachment($outFile);
$mail->send();
