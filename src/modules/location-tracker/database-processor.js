import { kafkaClient } from "./kafka-client.js";

async function init() {
  const consumer = kafkaClient.consumer({ groupId: "database-processor" });
  await consumer.connect();

  await consumer.subscribe({ topics: ["location-updates"], fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message, heartbeat }) => {
      const data = JSON.parse(message.value.toString());
      // Simulate DB insert — replace with actual drizzle insert for persistence
      console.log("INSERT INTO location_history:", {
        userId: data.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        recordedAt: new Date().toISOString(),
      });
      await heartbeat();
    },
  });
}

init();
