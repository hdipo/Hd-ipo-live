import type { LanguageMode } from '../types/vault';

export interface CopyStrings {
  appName: string;
  signInTitle: string;
  signInSubtitle: string;
  signInButton: string;
  signInPrivacyNote: string;
  allChats: string;
  pinned: string;
  archived: string;
  folders: string;
  newFolder: string;
  saveChat: string;
  importFile: string;
  exportVault: string;
  searchPlaceholder: string;
  noChatsTitle: string;
  noChatsDesc: string;
  saveFirstChat: string;
  pasteFromClipboard: string;
  pastePlaceholder: string;
  titleLabel: string;
  titlePlaceholder: string;
  sourceLabel: string;
  folderLabel: string;
  noFolder: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  cancel: string;
  savePermanently: string;
  saving: string;
  appendPlaceholder: string;
  addMessage: string;
  copyAll: string;
  copied: string;
  pin: string;
  unpin: string;
  archive: string;
  restore: string;
  delete: string;
  edit: string;
  signOut: string;
  messagesUnit: string;
  selectChatPrompt: string;
  selectChatSub: string;
  parsedTurnsHint: string;
  quickSaveBanner: string;
}

export const COPY: Record<LanguageMode, CopyStrings> = {
  en: {
    appName: 'ChatVault',
    signInTitle: 'Keep every temporary chat permanently safe.',
    signInSubtitle:
      'Paste conversations from temporary AI sessions, disappearing messages, or quick drafts. Organize them in folders, search anytime, and sync securely to your private cloud.',
    signInButton: 'Continue with Google',
    signInPrivacyNote: 'Private to your account. Only you can read or edit your saved chats.',
    allChats: 'All Saved Chats',
    pinned: 'Pinned',
    archived: 'Archived',
    folders: 'Folders',
    newFolder: 'New Folder',
    saveChat: 'Save Chat',
    importFile: 'Import File',
    exportVault: 'Backup All',
    searchPlaceholder: 'Search titles, messages, notes, or tags...',
    noChatsTitle: 'No saved chats yet',
    noChatsDesc:
      'Paste a temporary chat conversation or import a text file to store it permanently in your vault.',
    saveFirstChat: 'Save Your First Chat',
    pasteFromClipboard: 'Paste Clipboard',
    pastePlaceholder:
      'Paste your temporary chat here...\n\nExample:\nYou: How do I organize my study notes?\nAI: Start by grouping topics into clear folders...',
    titleLabel: 'Chat Title',
    titlePlaceholder: 'e.g., Tax Deductions Summary or Project Plan',
    sourceLabel: 'Source',
    folderLabel: 'Folder',
    noFolder: 'Uncategorized',
    tagsLabel: 'Tags (comma separated)',
    tagsPlaceholder: 'work, important, ideas',
    notesLabel: 'Personal Notes (optional)',
    notesPlaceholder: 'Add key takeaways or reminders about this chat...',
    cancel: 'Cancel',
    savePermanently: 'Save to Vault',
    saving: 'Saving...',
    appendPlaceholder: 'Paste or type another message from your temporary chat to append here...',
    addMessage: 'Add Message',
    copyAll: 'Copy All',
    copied: 'Copied',
    pin: 'Pin',
    unpin: 'Unpin',
    archive: 'Archive',
    restore: 'Restore',
    delete: 'Delete',
    edit: 'Edit',
    signOut: 'Sign Out',
    messagesUnit: 'messages',
    selectChatPrompt: 'Select a saved chat to view',
    selectChatSub: 'Choose a conversation from the list or save a new temporary chat.',
    parsedTurnsHint: 'detected turns will be structured cleanly',
    quickSaveBanner: 'Temporary chat data copied? Paste and save it before it disappears.',
  },
  hinglish: {
    appName: 'ChatVault',
    signInTitle: 'Apne temporary chat ka saara data hamesha ke liye save rakhein.',
    signInSubtitle:
      'Temporary AI chats, disappearing messages, ya zaroori notes ko paste karke folders mein safely store karein. Kabhi bhi search karein aur har device par access karein.',
    signInButton: 'Google se Login Karein',
    signInPrivacyNote: 'Aapka data bilkul private hai. Sirf aap hi ise dekh aur edit kar sakte hain.',
    allChats: 'Sabhi Saved Chats',
    pinned: 'Pinned / Zaroori',
    archived: 'Archived',
    folders: 'Folders',
    newFolder: 'Naya Folder',
    saveChat: 'Chat Save Karein',
    importFile: 'File Import Karein',
    exportVault: 'Full Backup',
    searchPlaceholder: 'Title, message, notes ya tags search karein...',
    noChatsTitle: 'Abhi koi chat save nahi hai',
    noChatsDesc:
      'Apne temporary chat ka data yahan paste karein ya file import karein taaki woh kabhi delete na ho.',
    saveFirstChat: 'Pehla Chat Save Karein',
    pasteFromClipboard: 'Clipboard Paste Karein',
    pastePlaceholder:
      'Apna temporary chat yahan paste karein...\n\nExample:\nYou: Mera project plan bana do\nAI: Zaroor, yeh raha step-by-step plan...',
    titleLabel: 'Chat ka Title',
    titlePlaceholder: 'jaise: Important Notes ya Study Plan',
    sourceLabel: 'Kahan se hai (Source)',
    folderLabel: 'Folder chunein',
    noFolder: 'Bina Folder ke',
    tagsLabel: 'Tags (comma lagakar)',
    tagsPlaceholder: 'work, urgent, study',
    notesLabel: 'Apne Notes (optional)',
    notesPlaceholder: 'Is chat ke baare mein koi khaas baat yaad rakhne ke liye likhein...',
    cancel: 'Cancel',
    savePermanently: 'Vault mein Save Karein',
    saving: 'Save ho raha hai...',
    appendPlaceholder: 'Temporary chat ka agla message yahan paste ya type karke jodein...',
    addMessage: 'Message Jodein',
    copyAll: 'Sab Copy Karein',
    copied: 'Copy Ho Gaya',
    pin: 'Pin Karein',
    unpin: 'Unpin Karein',
    archive: 'Archive Karein',
    restore: 'Wapas Laayein',
    delete: 'Delete Karein',
    edit: 'Edit Karein',
    signOut: 'Logout',
    messagesUnit: 'messages',
    selectChatPrompt: 'Koi saved chat chunein',
    selectChatSub: 'List mein se chat select karein ya naya temporary chat save karein.',
    parsedTurnsHint: 'messages automatically detect ho gaye hain',
    quickSaveBanner: 'Temporary chat copy kiya hai? Delete hone se pehle yahan save kar lein.',
  },
};
