package com.myown.app.camelwss.route;

import org.apache.camel.Exchange;
import org.apache.camel.LoggingLevel;
import org.apache.camel.Processor;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public class BasicWSRoute extends RouteBuilder {
	
	static Logger logger = LoggerFactory.getLogger(BasicWSRoute.class);
	
	private final String CONNECTION_URI = "//localhost:9292/basic"; 

	@Override
	public void configure() throws Exception {
		
		from("websocket:"+CONNECTION_URI+"?enableJmx=false")
		.routeId("mainRoute")
        .log(LoggingLevel.DEBUG,">> msg recieved : ${body}")
        //.delay(2000)
        .unmarshal().json(JsonLibrary.Jackson, WsMessage.class)
        .process(new Processor() {
			
			@Override
			public void process(Exchange exchange) throws Exception {
				WsMessage info = exchange.getIn().getBody(WsMessage.class);
				
				logger.info("data from client: " + info);
				DateTime nuh = new DateTime();
				String msg = "pong: " + nuh.toString("HH:mm:ss");
				WsMessage response = new WsMessage();
				response.setHeader("msg");
				response.setSender("server");
				response.setContent(msg);
				exchange.getIn().setBody(response, WsMessage.class);
				
			}
		})
		.marshal().json(JsonLibrary.Jackson, WsMessage.class)
		.to("direct:ut");
		
		
		from("direct:ut")
		.log(LoggingLevel.DEBUG,">> msg response : ${body}")
        .to("websocket:"+CONNECTION_URI+"?sendToAll=true&enableJmx=false");
	}
	
	String getConnectionUri()
	{
		return CONNECTION_URI;
	}
}
