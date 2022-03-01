SELECT id, name, username, COUNT(conn."toId")
  FROM public."TUser" u 
    LEFT JOIN (
		SELECT * FROM (
			SELECT
			DISTINCT ON (_inner."fromId", _inner."toId") 
			_inner."fromId", _inner."toId", _inner."status", _inner."version", _inner."createdAt" 
			FROM public."TConnection" _inner
			ORDER BY _inner."fromId", _inner."toId", _inner."version" DESC
		) conn
		WHERE conn."status" = 'CONNECTED') 
	conn
    ON u.id = conn."toId"
  GROUP BY u.id
  ORDER BY COUNT(conn."toId") DESC;

