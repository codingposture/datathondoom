import { ConversationView } from "@/components/ConversationView";

export default async function EmbedDialogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationView id={decodeURIComponent(id)} embedded />;
}
