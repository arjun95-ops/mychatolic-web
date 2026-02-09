import BibleStudio from "@/components/bible-studio/BibleStudio";
import { ToastProvider } from "@/components/ui/Toast";

export default function BibleStudioPage() {
  return (
    <ToastProvider>
      <BibleStudio />
    </ToastProvider>
  );
}
