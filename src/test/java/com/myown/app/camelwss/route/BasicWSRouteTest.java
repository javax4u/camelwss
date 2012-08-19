package com.myown.app.camelwss.route;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.apache.camel.test.junit4.CamelSpringTestSupport;
import org.codehaus.jackson.map.ObjectMapper;
import org.junit.Test;
import org.springframework.context.support.AbstractApplicationContext;
import org.springframework.context.support.ClassPathXmlApplicationContext;

import com.ning.http.client.AsyncHttpClient;
import com.ning.http.client.websocket.WebSocket;
import com.ning.http.client.websocket.WebSocketTextListener;
import com.ning.http.client.websocket.WebSocketUpgradeHandler;

public class BasicWSRouteTest extends CamelSpringTestSupport {

	private static List<String> received = new ArrayList<String>();
    private static CountDownLatch latch = new CountDownLatch(1);
	
	@Override
	public String isMockEndpoints() {		
		return "*";
	}

	@Test
	public void happyTest() throws Exception
	{
		BasicWSRoute route = context.getRegistry().lookup("basicRoute", BasicWSRoute.class);
		
		AsyncHttpClient c = new AsyncHttpClient();

        WebSocket websocket = c.prepareGet("ws:" + route.getConnectionUri()).execute(
            new WebSocketUpgradeHandler.Builder()
                .addWebSocketListener(new WebSocketTextListener() {
                    @Override
                    public void onMessage(String message) {
                        received.add(message);
                        System.out.println("received --> " + message);
                        latch.countDown();
                    }

                    @Override
                    public void onFragment(String fragment, boolean last) {
                    }

                    @Override
                    public void onOpen(WebSocket websocket) {
                    }

                    @Override
                    public void onClose(WebSocket websocket) {
                    }

                    @Override
                    public void onError(Throwable t) {
                        t.printStackTrace();
                    }
                }).build()).get();

        // Jackson
        ObjectMapper mapper = new ObjectMapper();
        WsMessage info = new WsMessage();
        info.setHeader("woot");
        info.setContent("hest");
        
        websocket.sendTextMessage(mapper.writeValueAsString(info));
        assertTrue(latch.await(10, TimeUnit.SECONDS));

        assertEquals(1, received.size());
        WsMessage result = mapper.readValue(received.get(0), WsMessage.class);
        assertTrue(result.getContent().startsWith("pong:"));

        websocket.close();
        c.close();
	}
	
	@Override
	protected AbstractApplicationContext createApplicationContext() {
		return new ClassPathXmlApplicationContext("spring-config.xml");
	}

}
