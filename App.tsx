
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Category, User, Workspace, Expense, AppState, View } from './types';
import { ICONS, CATEGORY_COLORS } from './constants';
import { categorizeExpense, getFinancialInsights } from './geminiService';

const DEFAULT_THEME = '#2563eb'; // blue-600

const THEME_OPTIONS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#4b5563', // Slate
];

const DEFAULT_USERS: User[] = [
  { id: 'u1', name: 'System Admin', email: 'admin@smartspend.com', password: 'admin', avatar: 'https://picsum.photos/seed/admin/120', role: 'Admin', themeColor: '#2563eb' },
];

const DEFAULT_WORKSPACE: Workspace = {
  id: 'w1',
  name: 'Main Workspace',
  currency: '$',
  budget: 5000,
  users: [DEFAULT_USERS[0]],
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('smartspend_v9');
    if (saved) return JSON.parse(saved);
    return {
      workspaces: [DEFAULT_WORKSPACE],
      users: DEFAULT_USERS,
      currentWorkspaceId: 'w1',
      expenses: [],
      activeUserId: null,
      activeView: 'dashboard',
      masterPassword: 'admin'
    };
  });

  const [isAdding, setIsAdding] = useState(false);
  const [isEditingSelf, setIsEditingSelf] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [insights, setInsights] = useState<string>('Analyzing your spending...');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<{ userId: string; name: string; themeColor?: string } | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  
  // Transaction Table State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [sortConfig, setSortConfig] = useState<{key: keyof Expense, direction: 'asc' | 'desc'}>({key: 'date', direction: 'desc'});

  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: Category.OTHER,
    aiInput: ''
  });

  useEffect(() => {
    localStorage.setItem('smartspend_v9', JSON.stringify(state));
  }, [state]);

  const currentWorkspace = useMemo(() => 
    state.workspaces.find(w => w.id === state.currentWorkspaceId) || state.workspaces[0]
  , [state.workspaces, state.currentWorkspaceId]);

  const activeUser = useMemo(() => 
    state.users.find(u => u.id === state.activeUserId) || null
  , [state.activeUserId, state.users]);

  const isAdmin = useMemo(() => activeUser?.role === 'Admin', [activeUser]);

  const workspaceExpenses = useMemo(() => 
    state.expenses.filter(e => e.workspaceId === currentWorkspace.id)
  , [state.expenses, currentWorkspace.id]);

  const filteredExpenses = useMemo(() => {
    let result = workspaceExpenses.filter(exp => {
      const matchesSearch = exp.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            exp.userName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || exp.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [workspaceExpenses, searchTerm, categoryFilter, sortConfig]);

  const totalSpent = useMemo(() => 
    workspaceExpenses.reduce((acc, curr) => acc + curr.amount, 0),
  [workspaceExpenses]);

  const budgetRemaining = currentWorkspace.budget - totalSpent;
  const spendingPercentage = (totalSpent / currentWorkspace.budget) * 100;

  const chartData = useMemo(() => {
    const map: Record<string, number> = {};
    workspaceExpenses.forEach(exp => {
      map[exp.category] = (map[exp.category] || 0) + exp.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [workspaceExpenses]);

  const fetchInsights = useCallback(async () => {
    if (workspaceExpenses.length > 0) {
      const text = await getFinancialInsights(workspaceExpenses, currentWorkspace.budget);
      setInsights(text);
    } else {
      setInsights("Add some expenses to get AI-powered insights!");
    }
  }, [workspaceExpenses, currentWorkspace.budget]);

  useEffect(() => {
    if (activeUser) fetchInsights();
  }, [fetchInsights, activeUser]);

  // Dynamic Theme Logic
  const primaryColor = activeUser?.themeColor || loginStep?.themeColor || DEFAULT_THEME;

  const handleUpdateTheme = (color: string) => {
    if (!state.activeUserId) return;
    setState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === prev.activeUserId ? { ...u, themeColor: color } : u)
    }));
  };

  // --- Permission Helpers ---
  const canModifyTransaction = useCallback((expense: Expense) => {
    if (!activeUser) return false;
    // Collaborative mode: Any member of the active workspace can manage its transactions
    return currentWorkspace.users.some(u => u.id === activeUser.id);
  }, [activeUser, currentWorkspace]);

  // --- Auth Handlers ---
  const handleSignUp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError(null);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (state.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      setAuthError("This email is already registered.");
      return;
    }

    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    const newUser: User = { 
      id: `u-${Date.now()}`, 
      name, 
      email, 
      password, 
      avatar: `https://picsum.photos/seed/${email}/120`, 
      role: 'Member',
      themeColor: DEFAULT_THEME
    };

    setState(prev => ({
      ...prev,
      users: [...prev.users, newUser],
      activeUserId: newUser.id,
      workspaces: prev.workspaces.map((ws, i) => i === 0 ? { ...ws, users: [...ws.users, newUser] } : ws)
    }));
  };

  const handleSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError(null);
    if (!loginStep) return;

    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const user = state.users.find(u => u.id === loginStep.userId);

    if (user && user.password === password) {
      setState(prev => ({ ...prev, activeUserId: user.id }));
      setLoginStep(null);
    } else {
      setAuthError("Incorrect password.");
    }
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, activeUserId: null }));
    setLoginStep(null);
    setAuthMode('signin');
  };

  const handleRevealPassword = (userId: string) => {
    const input = prompt("Enter the Master Admin Password to reveal this user's password:");
    if (input === state.masterPassword) {
      const user = state.users.find(u => u.id === userId);
      if (user) {
        alert(`ACCESS GRANTED: The password for ${user.name} is "${user.password}"`);
      } else {
        alert("User not found.");
      }
    } else if (input !== null) {
      alert("INVALID MASTER PASSWORD. Access Denied.");
    }
  };

  const handleSaveSelfProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeUser) return;
    const formData = new FormData(e.currentTarget);
    const updated: User = {
      ...activeUser,
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      avatar: formData.get('avatar') as string,
    };

    setState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === activeUser.id ? updated : u),
      expenses: prev.expenses.map(exp => exp.userId === activeUser.id ? { ...exp, userName: updated.name, userAvatar: updated.avatar } : exp),
      workspaces: prev.workspaces.map(ws => ({
        ...ws,
        users: ws.users.map(u => u.id === activeUser.id ? updated : u)
      }))
    }));
    setIsEditingSelf(false);
    alert("Profile Updated Successfully");
  };

  const handleDeleteUser = (userId: string) => {
    if (!isAdmin) return;
    if (userId === state.activeUserId) {
      alert("Safety Lock: You cannot delete your own active profile.");
      return;
    }
    if (confirm("DANGER: This will permanently delete this user and all associated workspace permissions. Proceed?")) {
      setState(prev => ({
        ...prev,
        users: prev.users.filter(u => u.id !== userId),
        workspaces: prev.workspaces.map(ws => ({
          ...ws,
          users: ws.users.filter(u => u.id !== userId)
        }))
      }));
    }
  };

  const toggleWorkspaceMember = (userId: string) => {
    if (!isAdmin) return;
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    setState(prev => {
      const ws = prev.workspaces.find(w => w.id === prev.currentWorkspaceId);
      if (!ws) return prev;

      const isMember = ws.users.some(u => u.id === userId);
      const updatedUsers = isMember 
        ? ws.users.filter(u => u.id !== userId)
        : [...ws.users, user];

      if (updatedUsers.length === 0) {
        alert("Action Blocked: A workspace requires at least one participating member.");
        return prev;
      }

      return {
        ...prev,
        workspaces: prev.workspaces.map(w => w.id === prev.currentWorkspaceId ? { ...w, users: updatedUsers } : w)
      };
    });
  };

  const handleAddExpense = () => {
    if (!newExpense.description || !newExpense.amount || !activeUser) return;
    
    const expense: Expense = {
      id: Date.now().toString(),
      amount: parseFloat(newExpense.amount),
      description: newExpense.description,
      category: newExpense.category,
      date: new Date().toISOString().split('T')[0],
      userId: activeUser.id,
      userName: activeUser.name,
      userAvatar: activeUser.avatar,
      workspaceId: currentWorkspace.id
    };

    setState(prev => ({
      ...prev,
      expenses: [expense, ...prev.expenses]
    }));
    
    setNewExpense({ description: '', amount: '', category: Category.OTHER, aiInput: '' });
    setIsAdding(false);
  };

  const handleAiCategorize = async () => {
    if (!newExpense.aiInput) return;
    setAiLoading(true);
    const result = await categorizeExpense(newExpense.aiInput);
    setNewExpense(prev => ({
      ...prev,
      description: result.description,
      amount: result.amount?.toString() || prev.amount,
      category: result.category,
    }));
    setAiLoading(false);
  };

  // --- Transaction Management ---
  const toggleExpenseSelection = (id: string) => {
    setSelectedExpenseIds(prev => 
      prev.includes(id) ? prev.filter(eid => eid !== id) : [...prev, id]
    );
  };

  const toggleAllExpenses = () => {
    if (selectedExpenseIds.length === filteredExpenses.length) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(filteredExpenses.map(e => e.id));
    }
  };

  const deleteExpense = (expense: Expense) => {
    if (!canModifyTransaction(expense)) {
      alert("Permission Error: You are not a registered member of this workspace.");
      return;
    }

    if (confirm(`Remove transaction "${expense.description}"?`)) {
      setState(prev => ({
        ...prev,
        expenses: prev.expenses.filter(e => e.id !== expense.id)
      }));
      setSelectedExpenseIds(prev => prev.filter(eid => eid !== expense.id));
    }
  };

  const deleteSelectedExpenses = () => {
    if (confirm(`Confirm bulk deletion of ${selectedExpenseIds.length} transactions?`)) {
      setState(prev => ({
        ...prev,
        expenses: prev.expenses.filter(e => !selectedExpenseIds.includes(e.id))
      }));
      setSelectedExpenseIds([]);
    }
  };

  const requestSort = (key: keyof Expense) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // --- Views ---

  const renderDashboard = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass-card p-6 rounded-2xl shadow-sm border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Limit</p>
          <h2 className="text-3xl font-bold text-slate-900">{currentWorkspace.currency}{currentWorkspace.budget.toLocaleString()}</h2>
          <div className="mt-4 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
             <div 
              className={`h-full rounded-full transition-all duration-500`} 
              style={{ width: `${Math.min(spendingPercentage, 100)}%`, backgroundColor: spendingPercentage > 90 ? '#ef4444' : primaryColor }}
             />
          </div>
        </div>
        <div className="glass-card p-6 rounded-2xl shadow-sm border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Month Spending</p>
          <h2 className="text-3xl font-bold text-slate-900">{currentWorkspace.currency}{totalSpent.toLocaleString()}</h2>
          <div className="flex items-center gap-1 text-sm font-bold mt-2" style={{ color: spendingPercentage > 90 ? '#ef4444' : primaryColor }}>
            <ICONS.TrendUp />
            <span>{spendingPercentage.toFixed(1)}% of budget</span>
          </div>
        </div>
        <div className="glass-card p-6 rounded-2xl shadow-sm border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Left to Spend</p>
          <h2 className={`text-3xl font-bold ${budgetRemaining < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {currentWorkspace.currency}{budgetRemaining.toLocaleString()}
          </h2>
          <p className="text-xs text-slate-500 mt-2 font-medium">Safe spending: {currentWorkspace.currency}{(budgetRemaining / 30).toFixed(2)}/day</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="glass-card p-6 rounded-3xl shadow-sm border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <ICONS.Wallet /> Spending Intensity
            </h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || primaryColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="glass-card p-6 rounded-3xl shadow-sm bg-white border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Recent Activity</h3>
              <button 
                onClick={() => setState(prev => ({...prev, activeView: 'transactions'}))}
                className="text-xs font-bold hover:underline"
                style={{ color: primaryColor }}
              >
                View full history
              </button>
            </div>
            <div className="space-y-4">
              {workspaceExpenses.slice(0, 5).map(expense => (
                <div key={expense.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: CATEGORY_COLORS[expense.category] }}>
                      {expense.category[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{expense.description}</p>
                      <p className="text-xs text-slate-400 font-medium">{expense.category} • {expense.date}</p>
                    </div>
                  </div>
                  <p className="font-black text-slate-900">{currentWorkspace.currency}{expense.amount.toLocaleString()}</p>
                </div>
              ))}
              {workspaceExpenses.length === 0 && (
                <p className="text-center py-8 text-slate-400 italic">No transactions found in this workspace.</p>
              )}
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 h-full">
          <div className="glass-card p-6 rounded-3xl shadow-sm flex flex-col h-full bg-white text-slate-900 border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Budget Allocation</h3>
            <div className="h-64 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || primaryColor} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4 mt-8 flex-1">
              {chartData.map(item => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: CATEGORY_COLORS[item.name] || primaryColor }}></div>
                    <span className="text-slate-600 font-semibold">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900">{currentWorkspace.currency}{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTransactions = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Transaction Archive</h2>
        <div className="flex items-center gap-3">
          {selectedExpenseIds.length > 0 && (
            <button 
              onClick={deleteSelectedExpenses}
              className="flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-red-100 transition-all border border-red-100"
            >
              <ICONS.Trash /> Bulk Action ({selectedExpenseIds.length})
            </button>
          )}
          <button 
            onClick={() => setIsAdding(true)} 
            className="flex items-center gap-2 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg hover:opacity-90 transition-all"
            style={{ backgroundColor: primaryColor }}
          >
            <ICONS.Plus /> New Spend
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
        <div className="md:col-span-8 relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <ICONS.Search />
          </div>
          <input 
            type="text" 
            placeholder="Search transactions..." 
            className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:ring-2 shadow-sm"
            style={{ '--tw-ring-color': primaryColor } as any}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="md:col-span-4">
          <select 
            className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:outline-none focus:ring-2 shadow-sm appearance-none"
            style={{ '--tw-ring-color': primaryColor } as any}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All Categories</option>
            {Object.values(Category).map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
      </div>

      <div className="glass-card rounded-3xl shadow-sm overflow-hidden border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-5 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 cursor-pointer rounded border-slate-300" 
                    style={{ accentColor: primaryColor }}
                    checked={filteredExpenses.length > 0 && selectedExpenseIds.length === filteredExpenses.length}
                    onChange={toggleAllExpenses}
                  />
                </th>
                <th onClick={() => requestSort('date')} className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors">
                  Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => requestSort('userName')} className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors">
                  Member {sortConfig.key === 'userName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => requestSort('category')} className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors">
                  Category {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => requestSort('description')} className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors">
                  Description {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => requestSort('amount')} className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors">
                  Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic font-medium">
                    No records match your search.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(expense => (
                  <tr key={expense.id} className={`hover:bg-slate-50/50 transition-colors ${selectedExpenseIds.includes(expense.id) ? 'bg-slate-50' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 cursor-pointer rounded border-slate-300"
                        style={{ accentColor: primaryColor }}
                        checked={selectedExpenseIds.includes(expense.id)}
                        onChange={() => toggleExpenseSelection(expense.id)}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-medium whitespace-nowrap">
                      {expense.date}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={expense.userAvatar} className="w-8 h-8 rounded-full border border-slate-100 shadow-sm" alt={expense.userName} />
                        <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{expense.userName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight text-white shadow-sm" style={{ backgroundColor: CATEGORY_COLORS[expense.category] }}>
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900 max-w-xs truncate">{expense.description}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-slate-900">
                      {currentWorkspace.currency}{expense.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => deleteExpense(expense)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Delete Transaction"
                      >
                        <ICONS.Trash />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // --- Workspace View ---
  const renderWorkspace = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Workspace Management</h2>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: primaryColor }}></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active: {currentWorkspace.name}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 rounded-3xl shadow-sm border-slate-100 bg-white">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Workspace Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-slate-400">Name</label>
                <p className="text-sm font-bold text-slate-900">{currentWorkspace.name}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-slate-400">Monthly Budget</label>
                <p className="text-sm font-bold text-slate-900">{currentWorkspace.currency}{currentWorkspace.budget.toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-slate-400">Total Members</label>
                <p className="text-sm font-bold text-slate-900">{currentWorkspace.users.length}</p>
              </div>
            </div>
          </div>
          
          {isAdmin && (
            <div className="glass-card p-6 rounded-3xl shadow-sm border-slate-100 bg-blue-50/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-blue-600"><ICONS.Sparkles /></div>
                <h3 className="text-sm font-bold text-blue-900">Admin Pro-Tip</h3>
              </div>
              <p className="text-xs text-blue-700 leading-relaxed font-medium">
                You can manage which system users have access to this specific workspace. All data within a workspace is shared among its members.
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="glass-card p-8 rounded-3xl shadow-sm border-slate-100 bg-white">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <ICONS.Users /> Workspace Members
            </h3>
            <div className="space-y-4">
              {state.users.map(user => {
                const isMember = currentWorkspace.users.some(u => u.id === user.id);
                return (
                  <div key={user.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-50 hover:bg-slate-50/50 transition-all">
                    <div className="flex items-center gap-4">
                      <img src={user.avatar} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" alt={user.name} />
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</p>
                      </div>
                    </div>
                    
                    {isAdmin ? (
                      <button 
                        onClick={() => toggleWorkspaceMember(user.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          isMember 
                            ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' 
                            : 'bg-green-50 text-green-600 border border-green-100 hover:bg-green-100'
                        }`}
                      >
                        {isMember ? 'Remove Access' : 'Grant Access'}
                      </button>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        isMember ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isMember ? 'Active Member' : 'No Access'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl text-slate-900">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings</h2>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
          <div className={`w-3 h-3 rounded-full animate-pulse`} style={{ backgroundColor: primaryColor }}></div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeUser?.role} Session</span>
        </div>
      </div>
      
      <div className="space-y-8">
        {/* User's Personal Profile Section */}
        <section className="glass-card p-8 rounded-3xl shadow-sm border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-8">
             <h3 className="font-bold text-xl text-slate-900 flex items-center gap-2"><ICONS.Users /> My Profile</h3>
             <button 
               onClick={() => setIsEditingSelf(!isEditingSelf)}
               className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all flex items-center gap-2"
               style={{ color: primaryColor }}
             >
               {isEditingSelf ? "Cancel Editing" : <><ICONS.Edit /> Edit Details</>}
             </button>
          </div>
          
          {isEditingSelf ? (
            <form onSubmit={handleSaveSelfProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Display Name</label>
                  <input name="name" type="text" defaultValue={activeUser?.name} required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                  <input name="email" type="email" defaultValue={activeUser?.email} required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Avatar URL (Seed)</label>
                <input name="avatar" type="text" defaultValue={activeUser?.avatar} required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
              </div>
              <button type="submit" className="px-8 py-4 rounded-2xl text-white font-black shadow-lg hover:opacity-90 active:scale-95 transition-all" style={{ backgroundColor: primaryColor }}>Save Changes</button>
            </form>
          ) : (
            <div className="flex items-center gap-6 p-6 rounded-3xl bg-slate-50/50 border border-slate-50">
              <img src={activeUser?.avatar} className="w-20 h-20 rounded-full border-4 border-white shadow-xl" alt={activeUser?.name} />
              <div>
                <p className="text-lg font-black text-slate-900 leading-tight">{activeUser?.name}</p>
                <p className="text-sm font-bold text-slate-400 mb-4">{activeUser?.email}</p>
                <div className="flex items-center gap-2">
                   <span className="text-[10px] font-black px-2 py-1 rounded-md bg-white border border-slate-100 text-slate-400 uppercase tracking-widest">Profile UID: {activeUser?.id}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="glass-card p-8 rounded-3xl shadow-sm border-slate-100 bg-white">
          <h3 className="font-bold text-xl text-slate-900 mb-6 flex items-center gap-2"><ICONS.Sparkles /> UI Personalization</h3>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-4 mb-4">
            {THEME_OPTIONS.map(color => (
              <button
                key={color}
                onClick={() => handleUpdateTheme(color)}
                className={`w-10 h-10 rounded-full border-4 transition-all ${primaryColor === color ? 'scale-110 shadow-lg' : 'opacity-60 hover:opacity-100'}`}
                style={{ backgroundColor: color, borderColor: primaryColor === color ? '#ffffff' : 'transparent' }}
              />
            ))}
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Select your profile branding color</p>
        </section>

        {isAdmin && (
          <section className="glass-card p-8 rounded-3xl shadow-sm border-slate-100 bg-white">
            <h3 className="font-bold text-xl text-slate-900 mb-8 flex items-center gap-2"><ICONS.Users /> Directory Management</h3>
            <div className="space-y-5">
              {state.users.map(user => (
                <div key={user.id} className="flex items-center justify-between p-6 rounded-3xl border border-slate-50 hover:bg-slate-50/50 transition-all">
                  <div className="flex items-center gap-5 flex-1">
                    <img src={user.avatar} className="w-16 h-16 rounded-full border-4 border-white shadow-md" />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-bold text-slate-900 text-lg leading-none">{user.name}</p>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest text-white`} style={{ backgroundColor: user.role === 'Admin' ? '#4f46e5' : '#94a3b8' }}>
                          {user.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-bold mb-2">{user.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleRevealPassword(user.id)} className="p-3 text-slate-300 hover:text-slate-900 rounded-2xl transition-all" title="View Secure Password"><ICONS.Eye /></button>
                    {state.activeUserId !== user.id && (
                      <>
                        <button onClick={() => handleDeleteUser(user.id)} className="p-3 text-slate-300 hover:text-red-500 rounded-2xl transition-all" title="Delete Profile"><ICONS.Trash /></button>
                        <button onClick={() => setLoginStep({ userId: user.id, name: user.name, themeColor: user.themeColor })} className="text-xs font-black px-5 py-2.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all uppercase tracking-tighter" style={{ color: primaryColor }}>Login As</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="glass-card p-8 rounded-3xl shadow-sm border-slate-100 bg-white">
            <h3 className="font-bold text-xl text-slate-900 mb-8 flex items-center gap-2"><ICONS.Settings /> Governance Config</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Currency Symbol</label>
                <input 
                  type="text" className="w-full border border-slate-100 bg-slate-50 p-4 rounded-2xl focus:ring-2 focus:outline-none font-bold text-slate-900" 
                  style={{ '--tw-ring-color': primaryColor } as any}
                  value={currentWorkspace.currency} 
                  onChange={(e) => setState(prev => ({...prev, workspaces: prev.workspaces.map(w => w.id === currentWorkspace.id ? {...w, currency: e.target.value} : w)}))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Default Limit</label>
                <input 
                  type="number" className="w-full border border-slate-100 bg-slate-50 p-4 rounded-2xl focus:ring-2 focus:outline-none font-bold text-slate-900" 
                  style={{ '--tw-ring-color': primaryColor } as any}
                  value={currentWorkspace.budget}
                  onChange={(e) => setState(prev => ({...prev, workspaces: prev.workspaces.map(w => w.id === currentWorkspace.id ? {...w, budget: parseFloat(e.target.value)} : w)}))}
                />
              </div>
            </div>
            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 flex items-center gap-4">
               <div className="p-3 bg-white rounded-xl shadow-sm text-blue-600"><ICONS.Eye /></div>
               <p className="text-xs font-bold text-blue-700 leading-relaxed">Governance Access: Workspace limits and currencies are synchronized for all participating members in the active space.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );

  const renderAuth = () => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 text-white rounded-[24px] flex items-center justify-center shadow-xl shadow-slate-200 mb-4" style={{ backgroundColor: primaryColor }}><ICONS.Wallet /></div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">SmartSpend</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Personal Expense Ecosystem</p>
        </div>

        <div className="glass-card bg-white p-10 rounded-[48px] shadow-2xl border-slate-100">
          {authMode === 'signup' ? (
            <form onSubmit={handleSignUp} className="space-y-5">
              <h2 className="text-2xl font-black mb-8 text-center">Join SmartSpend</h2>
              {authError && <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100">{authError}</div>}
              <input name="name" type="text" placeholder="Full Name" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
              <input name="email" type="email" placeholder="Email Address" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
              <input name="password" type="password" placeholder="Password" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
              <input name="confirmPassword" type="password" placeholder="Confirm Password" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
              <button type="submit" className="w-full py-5 rounded-2xl text-white font-black text-lg shadow-lg active:scale-[0.98] transition-all mt-4" style={{ backgroundColor: primaryColor }}>Create Profile</button>
              <button type="button" onClick={() => { setAuthMode('signin'); setAuthError(null); }} className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest mt-4">Already registered? Sign In</button>
            </form>
          ) : loginStep ? (
            <form onSubmit={handleSignIn} className="space-y-6">
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4">
                   <div className="absolute inset-0 rounded-full blur-xl opacity-20" style={{ backgroundColor: primaryColor }}></div>
                   <img src={`https://picsum.photos/seed/${loginStep.userId}/120`} className="w-24 h-24 rounded-full border-4 border-white shadow-xl relative" alt={loginStep.name} />
                </div>
                <h2 className="text-xl font-black">{loginStep.name}</h2>
                <button type="button" onClick={() => setLoginStep(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 hover:text-slate-600 transition-colors">Switch Profile</button>
              </div>
              {authError && <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100">{authError}</div>}
              <input name="password" type="password" placeholder="Enter Password" required autoFocus className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-5 text-sm font-bold text-white focus:outline-none focus:ring-2" style={{ '--tw-ring-color': primaryColor } as any} />
              <button type="submit" className="w-full py-5 rounded-2xl text-white font-black text-lg shadow-lg active:scale-[0.98] transition-all" style={{ backgroundColor: primaryColor }}>Access Workspace</button>
            </form>
          ) : (
            <div>
              <h2 className="text-2xl font-black mb-8 text-center">Welcome Back</h2>
              <div className="space-y-4">
                {state.users.map(user => (
                  <button 
                    key={user.id} 
                    onClick={() => setLoginStep({ userId: user.id, name: user.name, themeColor: user.themeColor })}
                    className="w-full flex items-center gap-4 p-4 rounded-3xl border border-slate-50 bg-slate-50/50 hover:bg-white hover:border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all group"
                  >
                    <img src={user.avatar} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" alt={user.name} />
                    <div className="text-left flex-1">
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user.role}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: user.themeColor || primaryColor }}><ICONS.LogOut /></div>
                  </button>
                ))}
              </div>
              <div className="mt-10 pt-8 border-t border-slate-50 text-center">
                <button type="button" onClick={() => { setAuthMode('signup'); setAuthError(null); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">New Member? Create Profile</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!activeUser) return renderAuth();

  const currentView = {
    dashboard: renderDashboard(),
    transactions: renderTransactions(),
    workspace: renderWorkspace(),
    settings: renderSettings()
  }[state.activeView];

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-slate-50/30">
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-100 p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-slate-100" style={{ backgroundColor: primaryColor }}><ICONS.Wallet /></div>
          <span className="font-bold text-2xl text-slate-900 tracking-tighter">SmartSpend</span>
        </div>
        <div className="space-y-2 mb-12 flex-1">
          <button onClick={() => setState(prev => ({ ...prev, activeView: 'dashboard' }))} className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl font-bold transition-all ${state.activeView === 'dashboard' ? 'text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`} style={{ backgroundColor: state.activeView === 'dashboard' ? primaryColor : undefined }}>
            <ICONS.Wallet /> Dashboard
          </button>
          <button onClick={() => setState(prev => ({ ...prev, activeView: 'transactions' }))} className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl font-bold transition-all ${state.activeView === 'transactions' ? 'text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`} style={{ backgroundColor: state.activeView === 'transactions' ? primaryColor : undefined }}>
            <ICONS.List /> History
          </button>
          <button onClick={() => setState(prev => ({ ...prev, activeView: 'workspace' }))} className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl font-bold transition-all ${state.activeView === 'workspace' ? 'text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`} style={{ backgroundColor: state.activeView === 'workspace' ? primaryColor : undefined }}>
            <ICONS.Users /> Spaces
          </button>
          <button onClick={() => setState(prev => ({ ...prev, activeView: 'settings' }))} className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl font-bold transition-all ${state.activeView === 'settings' ? 'text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`} style={{ backgroundColor: state.activeView === 'settings' ? primaryColor : undefined }}>
            <ICONS.Settings /> System
          </button>
        </div>
        <div className="space-y-5">
          <div className="p-6 rounded-[32px] border border-slate-50 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ICONS.Sparkles />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>AI Logic</span>
            </div>
            <p className="text-[11px] text-slate-600 italic leading-relaxed font-bold">"{insights}"</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-4 w-full px-5 py-4 text-red-500 hover:bg-red-50 rounded-2xl font-bold transition-all">
            <ICONS.LogOut /> Log Out
          </button>
        </div>
      </nav>

      <main className="md:ml-64 p-4 md:p-12 max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-12 text-slate-900">
          <div className="flex items-center gap-5 bg-white p-3 pr-8 rounded-3xl border border-slate-100 shadow-sm">
            <img src={activeUser?.avatar} className="w-14 h-14 rounded-full border-2 shadow-md" style={{ borderColor: primaryColor }} alt={activeUser?.name} />
            <div>
              <h1 className="text-lg font-black text-slate-900 leading-none mb-1">{activeUser?.name}</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{activeUser?.role} Account</p>
            </div>
          </div>
        </header>

        {currentView}
      </main>

      {/* Modal - Transaction Creation */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 text-slate-900">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-lg" onClick={() => setIsAdding(false)}></div>
          <div className="relative bg-white rounded-[48px] w-full max-w-md shadow-2xl p-12 overflow-hidden border border-slate-100">
            <h3 className="text-3xl font-black mb-10 tracking-tight text-center">New Expense</h3>
            <div className="p-8 rounded-[36px] mb-10 shadow-xl text-white transition-colors duration-500" style={{ backgroundColor: primaryColor }}>
              <label className="text-[10px] font-black uppercase mb-4 block flex items-center gap-2 opacity-80 tracking-widest"><ICONS.Sparkles /> Natural Input</label>
              <div className="flex gap-4">
                <input 
                  type="text" 
                  placeholder="e.g. Spent 25.50 on pizza" 
                  className="flex-1 bg-black/40 border border-white/20 rounded-2xl px-5 py-4 text-sm font-bold text-white placeholder:text-white/60 focus:outline-none focus:bg-black/60 transition-all" 
                  value={newExpense.aiInput} 
                  onChange={(e) => setNewExpense(prev => ({...prev, aiInput: e.target.value}))} 
                />
                <button onClick={handleAiCategorize} disabled={aiLoading} className="bg-white p-4 rounded-2xl hover:bg-slate-100 transition-all shadow-md" style={{ color: primaryColor }}>
                  {aiLoading ? <div className="animate-spin w-6 h-6 border-4 border-t-transparent rounded-full" style={{ borderColor: primaryColor }}/> : <ICONS.Sparkles />}
                </button>
              </div>
            </div>
            <div className="space-y-6">
              <input type="text" className="w-full border border-slate-800 p-5 rounded-3xl font-bold focus:ring-2 focus:outline-none bg-black text-white placeholder:text-slate-500" style={{ '--tw-ring-color': primaryColor } as any} placeholder="Short Description" value={newExpense.description} onChange={(e) => setNewExpense(prev => ({...prev, description: e.target.value}))} />
              <div className="grid grid-cols-2 gap-5">
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-300">{currentWorkspace.currency}</span>
                  <input type="number" className="w-full border border-slate-800 pl-10 pr-5 py-5 rounded-3xl font-black focus:ring-2 focus:outline-none bg-black text-white" style={{ '--tw-ring-color': primaryColor } as any} placeholder="0.00" value={newExpense.amount} onChange={(e) => setNewExpense(prev => ({...prev, amount: e.target.value}))} />
                </div>
                <select className="w-full border border-slate-800 p-5 rounded-3xl font-bold appearance-none bg-black text-white focus:ring-2 focus:outline-none" style={{ '--tw-ring-color': primaryColor } as any} value={newExpense.category} onChange={(e) => setNewExpense(prev => ({...prev, category: e.target.value as Category}))}>
                  {Object.values(Category).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <button onClick={handleAddExpense} className="w-full text-white py-6 rounded-3xl font-black text-xl mt-8 shadow-2xl active:scale-95 transition-all" style={{ backgroundColor: primaryColor }}>Confirm Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation - Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around py-5 z-40 px-6 shadow-2xl">
        <button onClick={() => setState(prev => ({ ...prev, activeView: 'dashboard' }))} className={`flex flex-col items-center gap-1 transition-all ${state.activeView === 'dashboard' ? 'scale-110' : 'text-slate-400'}`} style={{ color: state.activeView === 'dashboard' ? primaryColor : undefined }}>
          <ICONS.Wallet /><span className="text-[10px] font-black uppercase tracking-tighter">Budget</span>
        </button>
        <button onClick={() => setState(prev => ({ ...prev, activeView: 'transactions' }))} className={`flex flex-col items-center gap-1 transition-all ${state.activeView === 'transactions' ? 'scale-110' : 'text-slate-400'}`} style={{ color: state.activeView === 'transactions' ? primaryColor : undefined }}>
          <ICONS.List /><span className="text-[10px] font-black uppercase tracking-tighter">History</span>
        </button>
        <button onClick={() => setState(prev => ({ ...prev, activeView: 'workspace' }))} className={`flex flex-col items-center gap-1 transition-all ${state.activeView === 'workspace' ? 'scale-110' : 'text-slate-400'}`} style={{ color: state.activeView === 'workspace' ? primaryColor : undefined }}>
          <ICONS.Users /><span className="text-[10px] font-black uppercase tracking-tighter">Rooms</span>
        </button>
        <button onClick={() => setState(prev => ({ ...prev, activeView: 'settings' }))} className={`flex flex-col items-center gap-1 transition-all ${state.activeView === 'settings' ? 'scale-110' : 'text-slate-400'}`} style={{ color: state.activeView === 'settings' ? primaryColor : undefined }}>
          <ICONS.Settings /><span className="text-[10px] font-black uppercase tracking-tighter">System</span>
        </button>
      </div>
    </div>
  );
};

export default App;
