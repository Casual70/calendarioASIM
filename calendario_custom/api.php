<?php
/**
 * ASIM Multiservices - API Calendario Interventi
 * Gestisce il salvataggio su server dei dati importati da CSV e la restituzione degli eventi.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/events.json';
$csvBackupFile = $dataDir . '/last_import.csv';

// Assicura l'esistenza della cartella data
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. GET: Restituisce gli eventi salvati
if ($action === 'get') {
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $decoded = json_decode($content, true);
        if (is_array($decoded)) {
            echo json_encode([
                'status' => 'ok',
                'events' => $decoded,
                'count' => count($decoded),
                'last_updated' => date('Y-m-d H:i:s', filemtime($dataFile))
            ]);
            exit;
        }
    }
    echo json_encode([
        'status' => 'ok',
        'events' => [],
        'count' => 0
    ]);
    exit;
}

// 2. UPLOAD: Riceve file CSV e salva
if ($action === 'upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_FILES['csv_file']) && $_FILES['csv_file']['error'] === UPLOAD_ERR_OK) {
        $tmpName = $_FILES['csv_file']['tmp_name'];
        $csvContent = file_get_contents($tmpName);

        // Salva copia file CSV
        @file_put_contents($csvBackupFile, $csvContent);

        // Parsa il CSV lato server come backup
        $parsedEvents = parseServerCsv($csvContent);
        if (!empty($parsedEvents)) {
            file_put_contents($dataFile, json_encode($parsedEvents, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            echo json_encode([
                'status' => 'ok',
                'count' => count($parsedEvents),
                'events' => $parsedEvents
            ]);
            exit;
        }
    }

    echo json_encode(['status' => 'error', 'message' => 'Caricamento fallito o nessun dato valido']);
    exit;
}

// 3. SAVE_EVENTS: Salva array JSON inviato dal frontend
if ($action === 'save_events' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (isset($data['events']) && is_array($data['events'])) {
        file_put_contents($dataFile, json_encode($data['events'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode(['status' => 'ok', 'count' => count($data['events'])]);
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Dati non validi']);
    exit;
}

// 4. CLEAR: Svuota i dati memorizzati
if ($action === 'clear' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (file_exists($dataFile)) {
        @unlink($dataFile);
    }
    if (file_exists($csvBackupFile)) {
        @unlink($csvBackupFile);
    }
    echo json_encode(['status' => 'ok', 'message' => 'Dati cancellati']);
    exit;
}

// 5. SEND_EMAIL: Invia email con riepilogo calendario ad un indirizzo
if ($action === 'send_email' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!empty($data['to']) && filter_var($data['to'], FILTER_VALIDATE_EMAIL)) {
        $to = $data['to'];
        $subject = !empty($data['subject']) ? $data['subject'] : 'Calendario Interventi ASIM Multiservices';
        $body = !empty($data['body']) ? $data['body'] : '';
        $headers = "From: noreply@asimultiservices.com\r\n" .
                   "Reply-To: info@asimultiservices.com\r\n" .
                   "Content-Type: text/plain; charset=UTF-8\r\n" .
                   "X-Mailer: PHP/" . phpversion();

        $sent = @mail($to, $subject, $body, $headers);
        echo json_encode(['status' => $sent ? 'ok' : 'sent_fallback', 'to' => $to]);
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Indirizzo email non valido']);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Azione non riconosciuta']);
exit;

/**
 * Parser CSV server-side per i task ASIM
 */
function parseServerCsv($text) {
    $lines = [];
    $rows = str_getcsv($text, "\n");
    if (empty($rows)) return [];

    $stream = fopen('php://memory', 'r+');
    fwrite($stream, $text);
    rewind($stream);

    $header = null;
    $events = [];
    $now = new DateTime();

    while (($row = fgetcsv($stream, 0, ',', '"', '\\')) !== false) {
        if ($header === null) {
            $header = array_map(function($h) { return strtoupper(trim($h)); }, $row);
            continue;
        }

        if (empty($row) || (count($row) === 1 && empty($row[0]))) continue;

        $item = [];
        foreach ($header as $i => $h) {
            $item[$h] = isset($row[$i]) ? trim($row[$i]) : '';
        }

        if (isset($item['TYPE']) && strtolower($item['TYPE']) !== 'task') continue;
        if (empty($item['CONTENT'])) continue;

        $content = $item['CONTENT'];
        $desc = isset($item['DESCRIPTION']) ? $item['DESCRIPTION'] : '';
        $rawDate = isset($item['DATE']) ? $item['DATE'] : '';

        // Codice
        $code = 'Altro';
        if (preg_match('/\b([A-Z]\d{2})\b/', $content, $m)) {
            $code = $m[1];
        }

        // Tecnico
        $tech = 'Non assegnato';
        if (preg_match('/@([A-Za-z0-9_]+)/', $content, $m)) {
            $tech = $m[1];
        } elseif (preg_match('/Tecnico\s*:\s*([^\r\n]+)/i', $desc, $m)) {
            $tech = trim($m[1]);
        }

        // Cliente
        $client = trim(preg_replace('/@[A-Za-z0-9_]+|\b[A-Z]\d{2}\b/', '', $content));
        if (empty($client)) $client = $content;

        // Data & Ora
        $dateInfo = parseServerDate($rawDate, $now);

        // Estrai campi descrizione
        $pdr = preg_match('/PDR\s*:\s*([^\r\n]+)/i', $desc, $m) ? trim($m[1]) : '';
        $matricola = preg_match('/Matricola\s*:\s*([^\r\n]+)/i', $desc, $m) ? trim($m[1]) : '';
        $indirizzo = preg_match('/Indirizzo\s*:\s*([^\r\n]+)/i', $desc, $m) ? trim($m[1]) : '';
        $telefono = preg_match('/Telefono\s*:\s*([^\r\n]+)/i', $desc, $m) ? trim($m[1]) : '';
        $note = preg_match('/NOTE\s*:\s*([\s\S]*)/i', $desc, $m) ? trim($m[1]) : '';

        $events[] = [
            'id' => 'srv_' . uniqid(),
            'rawContent' => $content,
            'clientName' => $client,
            'jobCode' => $code,
            'technician' => $tech,
            'priority' => isset($item['PRIORITY']) ? (int)$item['PRIORITY'] : 0,
            'author' => isset($item['AUTHOR']) ? $item['AUTHOR'] : '',
            'date' => $dateInfo['date'],
            'time' => $dateInfo['time'],
            'hasSpecificTime' => $dateInfo['hasTime'],
            'rawDate' => $rawDate,
            'pdr' => $pdr,
            'matricola' => $matricola,
            'indirizzo' => $indirizzo,
            'telefono' => $telefono,
            'note' => $note
        ];
    }
    fclose($stream);

    return $events;
}

function parseServerDate($str, $now) {
    $dateObj = clone $now;
    $time = '09:00';
    $hasTime = false;

    if (!empty($str)) {
        $s = strtolower(trim($str));
        if (preg_match('/(?:at\s+)?(\d{1,2}):(\d{2})/', $s, $tm)) {
            $time = sprintf('%02d:%02d', $tm[1], $tm[2]);
            $hasTime = true;
        }

        if (strpos($s, 'today') !== false) {
            // date remains today
        } elseif (strpos($s, 'tomorrow') !== false) {
            $dateObj->modify('+1 day');
        } elseif (strpos($s, 'yesterday') !== false) {
            $dateObj->modify('-1 day');
        } elseif (preg_match('/in\s+(\d+)\s+days?/', $s, $dm)) {
            $dateObj->modify('+' . $dm[1] . ' days');
        } elseif (preg_match('/(\d+)\s+days?\s+ago/', $s, $dm)) {
            $dateObj->modify('-' . $dm[1] . ' days');
        } else {
            $parsed = @strtotime($str);
            if ($parsed !== false) {
                $dateObj->setTimestamp($parsed);
            }
        }
    }

    return [
        'date' => $dateObj->format('Y-m-d'),
        'time' => $time,
        'hasTime' => $hasTime
    ];
}

