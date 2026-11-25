<?php
/**
 * Tutor Story — PHP Home Page Entry Point
 * Redirects or serves the compiled Tutor Story application bundle safely.
 */
header('Content-Type: text/html; charset=UTF-8');
$distIndex = __DIR__ . '/dist/index.html';
if (file_exists($distIndex)) {
    readfile($distIndex);
    exit;
}
readfile(__DIR__ . '/index.html');
