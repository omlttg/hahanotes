export interface Scene {
  speaker: 'rookie' | 'cynic';
  text: string;
  memeId: 'clown' | 'harold' | 'fine_dog' | 'drake_no' | 'drake_yes' | 'doge' | 'burn';
  audioUrl?: string;
}

export interface HahaNoteScript {
  title: string;
  scenes: Scene[];
  conversation_id: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'rookie' | 'cynic';
  text: string;
  audioUrl?: string;
  timestamp: Date;
}
