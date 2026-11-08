import "server-only";
export interface InvitationDelivery {
  deliver(input: {
    recipient: string;
    link: string;
  }): Promise<{ mode: "simulated" | "external"; message: string }>;
}
// No verified Photon SMS contract was supplied. Never invent a provider endpoint or claim SMS delivery.
export const invitationDelivery: InvitationDelivery = {
  async deliver() {
    return {
      mode: "simulated",
      message:
        process.env.SMS_DELIVERY_MODE === "external"
          ? "External SMS is unavailable. Use the simulated delivery link below."
          : "Simulated delivery. Share this one-time link through an independently verified channel.",
    };
  },
};
