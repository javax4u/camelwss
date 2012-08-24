<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">

<script src="js/heartbeat/dojo.js.uncompressed.js" ></script>
<script src="js/heartbeat/heartbeat.js" ></script>

<title>Heartbeat & Reconnect demo</title>
</head>
<body>
	<h1>Excessively Terrific Heartbeat & Reconnect Demo</h1>

	<a href="/camelwss/index.jsp">Back to index</a>
	<br>
    <img id="heartImg" src="img/blackheart.png" alt="hearthbeat" height="48" width="48" />
    <br>
	
	<div style="border: 1px black solid; width:260px;">
	<h3>Start and Stop the heartbeat</h3>
	<input id="startHeartButton" type="button" value="Start!">
	<input id="stopHeartButton" type="button" value="Stop!">
    </div>
    
    <br>
    
    <div style="border: 1px black solid; width:260px;">
	<h3>Enable/Disable the reconnect</h3>
	<div id="reconnectMsg" style="width:170px; color: red; float:left;"></div>
	<input id="enableReconnectButton" style="width:66px;" type="button" value="Enable!">
    </div>
    
    <!-- For outputting stuff -->
    <div id="log_div"></div>
</body>
</html>