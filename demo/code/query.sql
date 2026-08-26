SELECT kind, COUNT(*) AS n
FROM file_events
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY kind
ORDER BY n DESC;
