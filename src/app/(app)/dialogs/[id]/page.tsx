import { ConversationView } from "@/components/ConversationView";

export default async function DialogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationView id={decodeURIComponent(id)} />;
}
