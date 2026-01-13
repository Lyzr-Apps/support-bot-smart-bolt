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
  ChevronRight
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
    <div className="flex items-center space-x-2 px-4 py-3 bg-blue-50 rounded-2xl rounded-bl-sm max-w-[80px]">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
          className={`px-4 py-3 rounded-2xl ${
            isAgent
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-bl-sm'
              : 'bg-gray-100 text-gray-900 rounded-br-sm'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

          {/* Confidence score for agent messages */}
          {isAgent && message.confidence !== undefined && message.confidence > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-400/30">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-blue-100">Confidence:</span>
                <Badge variant="secondary" className="bg-blue-400/20 text-blue-50 text-xs">
                  {(message.confidence * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>
          )}

          {/* Sources */}
          {isAgent && message.sources && message.sources.length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-400/30">
              <p className="text-xs text-blue-100 mb-1">Sources:</p>
              <div className="space-y-1">
                {message.sources.map((source, idx) => (
                  <p key={idx} className="text-xs text-blue-50">
                    {typeof source === 'string' ? source : JSON.stringify(source)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className={`text-xs text-gray-500 mt-1 ${isAgent ? 'ml-1' : 'mr-1'}`}>
          {timeStr}
        </span>

        {/* Suggested follow-up questions */}
        {isAgent && message.suggested_followup && message.suggested_followup.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.suggested_followup.map((question, idx) => (
              <button
                key={idx}
                className="text-xs px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                onClick={() => {
                  const event = new CustomEvent('send-suggested-question', { detail: question })
                  window.dispatchEvent(event)
                }}
              >
                {question}
              </button>
            ))}
          </div>
        )}
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
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isActive ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <h4 className="text-sm font-medium text-gray-900 truncate flex-1">
          {conversation.title}
        </h4>
        <span className="text-xs text-gray-500 ml-2">{dateStr}</span>
      </div>
      <p className="text-xs text-gray-600 truncate">{conversation.preview}</p>
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

  // Filter conversations by search query
  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Sidebar - Desktop */}
      <div
        className={`${
          isSidebarOpen ? 'w-80' : 'w-0'
        } transition-all duration-300 border-r border-gray-200 bg-white flex flex-col overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
            <Button
              onClick={handleNewConversation}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              New Chat
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200"
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
              <p className="text-sm text-gray-500 text-center py-8">
                No conversations found
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-gray-600 hover:text-gray-900"
              >
                {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </Button>

              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Support Chat</h1>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-gray-600">Online</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
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
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-full text-sm hover:border-blue-300 hover:bg-blue-50 transition-colors"
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
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <Card className="shadow-sm">
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
                    className="flex-1 resize-none border-0 focus:outline-none focus:ring-0 bg-transparent text-sm placeholder:text-gray-400 max-h-32 overflow-y-auto"
                    style={{ minHeight: '24px' }}
                  />
                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isTyping}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">
                    Press Enter to send, Shift+Enter for new line
                  </span>
                  <span className={`text-xs ${inputValue.length > 450 ? 'text-red-500' : 'text-gray-400'}`}>
                    {inputValue.length}/500
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
