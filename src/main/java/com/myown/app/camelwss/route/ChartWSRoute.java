package com.myown.app.camelwss.route;

import java.util.Random;

import org.apache.camel.Exchange;
import org.apache.camel.LoggingLevel;
import org.apache.camel.Processor;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.eclipse.jetty.io.EofException;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ChartWSRoute extends RouteBuilder {
	
	static Logger logger = LoggerFactory.getLogger(ChartWSRoute.class);
	
	private final String CONNECTION_URI = "//localhost:9292/chart"; 

	@Override
	public void configure() throws Exception {
		
		onException(EofException.class).log("oops EofException");
		
				
		from("websocket:"+CONNECTION_URI+"?enableJmx=false")
		.routeId("chartRoute")
        .log(LoggingLevel.DEBUG,">> msg recieved : ${body}")
        .unmarshal().json(JsonLibrary.Jackson, WsMessage.class)
        .process(new Processor() {
			
			@Override
			public void process(Exchange exchange) throws Exception {
				WsMessage info = exchange.getIn().getBody(WsMessage.class);
				
				if( "cmd".equals(info.getHeader()))
				{
					if( "start".equals(info.getContent()))
						exchange.getContext().startRoute("timerRoute");
					if( "stop".equals(info.getContent()))
						exchange.getContext().stopRoute("timerRoute");
				}
				
				
				logger.info("data from client: " + info);
				WsMessage response = new WsMessage();
				response.setHeader("ping");
				response.setSender("server");
				response.setSenderTimestamp(String.valueOf(new DateTime().getMillis()));
				response.setContent("pong");
				
				exchange.getIn().setBody(response, WsMessage.class);
				
			}
		})
		.marshal().json(JsonLibrary.Jackson, WsMessage.class)
		.to("direct:chartUt");
		
		
		
		from("timer://myTimer?fixedRate=true&period=100")
		.routeId("timerRoute")
		.noAutoStartup()
		.process(new Processor() {
			
			Random randomGenerator = new Random();
			
			@Override
			public void process(Exchange exchange) throws Exception {
							
				WsMessage response = new WsMessage();
				response.setHeader("msg");
				String message = String.valueOf(randomGenerator.nextInt(20) + 1);
				response.setSender("server");
				response.setContent( message );
				exchange.getIn().setBody(response, WsMessage.class);
				
			}
		})
		.marshal().json(JsonLibrary.Jackson, WsMessage.class)
		.to("direct:chartUt");
		
		
		
		from("direct:chartUt")
//		.log(LoggingLevel.DEBUG,">> msg response : ${body}")
        .to("websocket:"+CONNECTION_URI+"?sendToAll=true&enableJmx=false");
		
		

	}

}
