import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Send,
  Minimize2,
  X,
  Search,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Lightbulb
} from 'lucide-react'
import { callAIAgent } from '@/utils/aiAgent'
import type { NormalizedAgentResponse } from '@/utils/aiAgent'

// Agent ID from workflow.json
const AGENT_ID = '696608c9c831c63e265e1355'

// TypeScript interfaces based on actual_test_response
interface SupportResult {
  answer: string
  sources: any[]
  confidence: number
  suggested_followup: string[]
}

interface SupportResponse {
  status: 'success' | 'error'
  result: SupportResult
  metadata?: {
    agent_name?: string
    timestamp?: string
  }
}

interface Message {
  id: string
  role: 'agent' | 'user'
  content: string
  timestamp: Date
  confidence?: number
  sources?: any[]
  suggested_followup?: string[]
}

interface Conversation {
  id: string
  title: string
  preview: string
  timestamp: Date
  messages: Message[]
}

// Quick reply chips for initial suggestions
const QUICK_REPLIES = ['Pricing', 'How to get started', 'Return policy', 'Contact sales']

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex items-center space-x-2 px-4 py-3 backdrop-blur-xl bg-gradient-to-br from-blue-500/60 to-purple-600/60 border border-white/30 rounded-2xl rounded-bl-sm max-w-[80px] shadow-lg">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
    </div>
  )
}

// Message bubble component
function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.role === 'agent'
  const timeStr = message.timestamp.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-4 animate-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'} max-w-[75%]`}>
        <div
          className={`px-4 py-3 rounded-2xl backdrop-blur-xl border shadow-lg ${
            isAgent
              ? 'bg-gradient-to-br from-blue-500/80 to-purple-600/80 text-white border-white/30 rounded-bl-sm'
              : 'bg-white/20 text-white border-white/30 rounded-br-sm'
          }`}
          style={{ boxShadow: isAgent ? '0 8px 32px 0 rgba(59, 130, 246, 0.37)' : '0 8px 32px 0 rgba(255, 255, 255, 0.15)' }}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

          {/* Confidence score for agent messages */}
          {isAgent && message.confidence !== undefined && message.confidence > 0 && (
            <div className="mt-2 pt-2 border-t border-white/20">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-white/80">Confidence:</span>
                <Badge variant="secondary" className="backdrop-blur-md bg-white/20 text-white text-xs border border-white/30">
                  {(message.confidence * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>
          )}

          {/* Sources */}
          {isAgent && message.sources && message.sources.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/20">
              <p className="text-xs text-white/80 mb-1">Sources:</p>
              <div className="space-y-1">
                {message.sources.map((source, idx) => {
                  const sourceText = typeof source === 'string' ? source : JSON.stringify(source)
                  const urlMatch = sourceText.match(/https?:\/\/[^\s]+/)

                  if (urlMatch) {
                    return (
                      <a
                        key={idx}
                        href={urlMatch[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white/90 hover:text-white underline block transition-colors"
                      >
                        {sourceText}
                      </a>
                    )
                  }

                  return (
                    <p key={idx} className="text-xs text-white/80">
                      {sourceText}
                    </p>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <span className={`text-xs text-white/50 mt-1 ${isAgent ? 'ml-1' : 'mr-1'}`}>
          {timeStr}
        </span>

      </div>
    </div>
  )
}

// Conversation list item component
function ConversationItem({
  conversation,
  isActive,
  onClick
}: {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
}) {
  const dateStr = conversation.timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
        isActive
          ? 'backdrop-blur-md bg-white/20 border border-white/40 shadow-lg'
          : 'backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <h4 className="text-sm font-medium text-white truncate flex-1">
          {conversation.title}
        </h4>
        <span className="text-xs text-white/60 ml-2">{dateStr}</span>
      </div>
      <p className="text-xs text-white/70 truncate">{conversation.preview}</p>
    </button>
  )
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>('')
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFeatureRequest, setShowFeatureRequest] = useState(false)
  const [featureRequestText, setFeatureRequestText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Get active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId)

  // Load conversations from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('support-conversations')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const conversationsWithDates = parsed.map((conv: any) => ({
          ...conv,
          timestamp: new Date(conv.timestamp),
          messages: conv.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }))
        setConversations(conversationsWithDates)
        if (conversationsWithDates.length > 0) {
          setActiveConversationId(conversationsWithDates[0].id)
        }
      } catch (e) {
        console.error('Failed to parse stored conversations:', e)
      }
    }

    // If no conversations, create initial one
    if (!stored || JSON.parse(stored).length === 0) {
      const initialConv = createNewConversation()
      setConversations([initialConv])
      setActiveConversationId(initialConv.id)
    }
  }, [])

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('support-conversations', JSON.stringify(conversations))
    }
  }, [conversations])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages, isTyping])

  // Listen for suggested question clicks
  useEffect(() => {
    const handleSuggestedQuestion = (e: CustomEvent) => {
      setInputValue(e.detail)
      inputRef.current?.focus()
    }

    window.addEventListener('send-suggested-question', handleSuggestedQuestion as EventListener)
    return () => {
      window.removeEventListener('send-suggested-question', handleSuggestedQuestion as EventListener)
    }
  }, [])

  function createNewConversation(): Conversation {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const welcomeMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'agent',
      content: "Hi! I'm here to help. Ask me anything about our products and services.",
      timestamp: new Date()
    }

    return {
      id,
      title: 'New Conversation',
      preview: 'Hi! I\'m here to help...',
      timestamp: new Date(),
      messages: [welcomeMessage]
    }
  }

  function addMessageToConversation(conversationId: string, message: Message) {
    setConversations(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        const updatedMessages = [...conv.messages, message]

        // Update title and preview based on first user message
        let title = conv.title
        let preview = conv.preview

        if (message.role === 'user' && conv.title === 'New Conversation') {
          title = message.content.slice(0, 40) + (message.content.length > 40 ? '...' : '')
        }

        preview = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '')

        return {
          ...conv,
          messages: updatedMessages,
          title,
          preview,
          timestamp: new Date()
        }
      }
      return conv
    }))
  }

  async function handleSendMessage(messageText?: string) {
    const textToSend = messageText || inputValue.trim()
    if (!textToSend || !activeConversationId) return

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    }

    addMessageToConversation(activeConversationId, userMessage)
    setInputValue('')
    setIsTyping(true)

    try {
      // Call AI agent
      const result = await callAIAgent(textToSend, AGENT_ID)

      if (result.success && result.response) {
        const response = result.response as unknown as SupportResponse

        // Add agent response message
        const agentMessage: Message = {
          id: `msg-${Date.now()}-agent`,
          role: 'agent',
          content: response.result.answer,
          timestamp: new Date(),
          confidence: response.result.confidence,
          sources: response.result.sources,
          suggested_followup: response.result.suggested_followup
        }

        addMessageToConversation(activeConversationId, agentMessage)
      } else {
        // Error handling
        const errorMessage: Message = {
          id: `msg-${Date.now()}-agent`,
          role: 'agent',
          content: result.error || 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date()
        }
        addMessageToConversation(activeConversationId, errorMessage)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      const errorMessage: Message = {
        id: `msg-${Date.now()}-agent`,
        role: 'agent',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date()
      }
      addMessageToConversation(activeConversationId, errorMessage)
    } finally {
      setIsTyping(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  function handleNewConversation() {
    const newConv = createNewConversation()
    setConversations(prev => [newConv, ...prev])
    setActiveConversationId(newConv.id)
  }

  function handleFeatureRequest() {
    if (!featureRequestText.trim()) return

    // Here you could send the feature request to an API
    console.log('Feature request submitted:', featureRequestText)

    // Reset and close
    setFeatureRequestText('')
    setShowFeatureRequest(false)
  }

  // Filter conversations by search query
  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      {/* Glassmorphism background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Sidebar - Desktop */}
      <div
        className={`${
          isSidebarOpen ? 'w-80' : 'w-0'
        } transition-all duration-300 backdrop-blur-xl bg-white/10 border-r border-white/20 flex flex-col overflow-hidden relative z-10`}
        style={{
          boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Conversations</h2>
            <Button
              onClick={handleNewConversation}
              size="sm"
              className="backdrop-blur-md bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-all duration-200"
            >
              New Chat
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 backdrop-blur-md bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20 transition-all"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {filteredConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => setActiveConversationId(conv.id)}
              />
            ))}
            {filteredConversations.length === 0 && (
              <p className="text-sm text-white/60 text-center py-8">
                No conversations found
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Feature Request Button */}
        <div className="p-4 border-t border-white/10">
          <Button
            onClick={() => setShowFeatureRequest(true)}
            className="w-full backdrop-blur-md bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 text-white border border-white/30 transition-all duration-200"
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            Feature Request
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Header */}
        <div className="backdrop-blur-xl bg-white/10 border-b border-white/20 px-6 py-4" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </Button>

              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center backdrop-blur-md shadow-lg">
                  <MessageCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-white">Support Chat</h1>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full shadow-lg shadow-green-400/50"></div>
                    <span className="text-xs text-white/70">Online</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10">
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            {activeConversation?.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {isTyping && (
              <div className="flex justify-start mb-4">
                <TypingIndicator />
              </div>
            )}

            {/* Quick replies - show only if first message (welcome) */}
            {activeConversation?.messages.length === 1 && !isTyping && (
              <div className="flex flex-wrap gap-2 mt-4 mb-8">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply}
                    onClick={() => handleSendMessage(reply)}
                    className="px-4 py-2 backdrop-blur-md bg-white/10 border border-white/30 text-white rounded-full text-sm hover:bg-white/20 transition-all duration-200 shadow-lg"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="backdrop-blur-xl bg-white/10 border-t border-white/20 px-6 py-4" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)' }}>
          <div className="max-w-4xl mx-auto">
            <Card className="backdrop-blur-xl bg-white/10 border-white/30 shadow-2xl">
              <CardContent className="p-3">
                <div className="flex items-end space-x-2">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => {
                      if (e.target.value.length <= 500) {
                        setInputValue(e.target.value)
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your question..."
                    rows={1}
                    className="flex-1 resize-none border-0 focus:outline-none focus:ring-0 bg-transparent text-sm placeholder:text-white/50 text-white max-h-32 overflow-y-auto"
                    style={{ minHeight: '24px' }}
                  />
                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isTyping}
                    size="sm"
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-white/60">
                    Press Enter to send, Shift+Enter for new line
                  </span>
                  <span className={`text-xs ${inputValue.length > 450 ? 'text-red-400' : 'text-white/50'}`}>
                    {inputValue.length}/500
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Feature Request Modal */}
      {showFeatureRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/50">
          <div className="relative w-full max-w-md">
            <Card className="backdrop-blur-2xl bg-white/10 border-white/30 shadow-2xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-400" />
                    Feature Request
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFeatureRequest(false)}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-sm text-white/70 mb-4">
                  Share your ideas to help us improve the experience!
                </p>

                <textarea
                  value={featureRequestText}
                  onChange={(e) => setFeatureRequestText(e.target.value)}
                  placeholder="Describe your feature request..."
                  rows={6}
                  className="w-full px-4 py-3 backdrop-blur-md bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 resize-none"
                />

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => setShowFeatureRequest(false)}
                    variant="outline"
                    className="flex-1 backdrop-blur-md bg-white/10 hover:bg-white/20 text-white border-white/30"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleFeatureRequest}
                    disabled={!featureRequestText.trim()}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white disabled:opacity-50 shadow-lg"
                  >
                    Submit
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
