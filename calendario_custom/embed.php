<?php
/**
 * ASIM Multiservices - Snippet di incorporamento (Embed)
 * Da includere in una qualsiasi pagina PHP esistente con:
 * <?php include_once __DIR__ . '/calendario_custom/embed.php'; ?>
 * 
 * Oppure specificando un elemento contenitore personalizzato.
 */

// Rileva automaticamente il path relativo/assoluto in base alla posizione
$basePath = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http") . "://$_SERVER[HTTP_HOST]";
$calCustomUrl = '/calendario/calendario_custom';
?>
<!-- ASIM Calendario Embed: Inizio -->
<link rel="stylesheet" href="<?php echo $calCustomUrl; ?>/css/calendar.css">

<div id="asim-calendar-root" class="asim-calendar-wrapper"></div>

<script src="<?php echo $calCustomUrl; ?>/js/calendar.js"></script>
<script>
  (function() {
    function initAsimCal() {
      if (typeof AsimCalendar !== 'undefined') {
        window.asimCalInstance = AsimCalendar.init({
          container: '#asim-calendar-root',
          apiUrl: '<?php echo $calCustomUrl; ?>/api.php',
          defaultView: 'month'
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAsimCal);
    } else {
      initAsimCal();
    }
  })();
</script>
<!-- ASIM Calendario Embed: Fine -->

