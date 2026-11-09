<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calendario Interventi | ASIM Multiservices</title>
  <link rel="stylesheet" href="css/calendar.css">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header-bar {
      max-width: 1350px;
      margin: 0 auto 16px auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-bar a {
      color: #0284c7;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .header-bar a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>

  <div class="header-bar">
    <a href="/calendario/">&larr; Torna alla pagina principale</a>
    <span style="font-size: 0.85rem; color: #64748b;">ASIM Multiservices SRL</span>
  </div>

  <!-- Contenitore del Calendario -->
  <div id="asim-calendar-app"></div>

  <script src="js/calendar.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      window.asimCalendar = AsimCalendar.init({
        container: '#asim-calendar-app',
        apiUrl: 'api.php',
        defaultView: 'month'
      });
    });
  </script>
</body>
</html>

