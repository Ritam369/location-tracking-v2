import { kafkaClient } from "./kafka-client.js";

export async function startSocketConsumer(io, producer, PORT) {
  const consumer = kafkaClient.consumer({ groupId: `socket-server-${PORT}` });
  await consumer.connect();
  await consumer.subscribe({ topics: ["location-updates"], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message, heartbeat }) => {
      const data = JSON.parse(message.value.toString());
      await heartbeat();
      io.emit("server:location:update", {
        userId: data.userId,
        firstName: data.firstName,
        latitude: data.latitude,
        longitude: data.longitude,
      });
    },
  });
}
