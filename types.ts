
export enum Category {
  HOUSING = 'Housing',
  TRANSPORTATION = 'Transportation',
  FOOD = 'Food & Dining',
  UTILITIES = 'Utilities',
  ENTERTAINMENT = 'Entertainment',
  SHOPPING = 'Shopping',
  HEALTH = 'Health',
  OTHER = 'Other'
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatar: string;
  role: 'Admin' | 'Member';
  themeColor?: string;
}

export interface Workspace {
  id: string;
  name: string;
  currency: string;
  budget: number;
  users: User[];
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: Category;
  date: string;
  userId: string;
  userName: string;
  userAvatar: string;
  workspaceId: string;
}

export type View = 'dashboard' | 'transactions' | 'workspace' | 'settings';

export interface AppState {
  workspaces: Workspace[];
  users: User[];
  currentWorkspaceId: string;
  expenses: Expense[];
  activeUserId: string | null; 
  activeView: View;
  masterPassword?: string; // Secret key for Admins to reveal user passwords
}
