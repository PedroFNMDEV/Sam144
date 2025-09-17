import React, { useState, useEffect } from 'react';
import { ChevronLeft, Radio, Play, Square, Settings, Upload, Eye, EyeOff, Plus, Trash2, Save, AlertCircle, CheckCircle, Activity, Users, Zap, Clock, Calendar, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useStream } from '../../context/StreamContext';
import IFrameVideoPlayer from '../../components/IFrameVideoPlayer';

interface Platform {
  id: string;
  nome: string;
  codigo: string;
  rtmp_base_url: string;
  requer_stream_key: boolean;
}

interface UserPlatform {
  id: number;
  id_platform: string;
  stream_key: string;
  rtmp_url: string;
  titulo_padrao: string;
  descricao_padrao: string;
  ativo: boolean;
  platform: Platform;
}

interface LiveTransmission {
  id: number;
  tipo: string;
  live_servidor: string;
  live_app: string;
  live_chave: string;
  data_inicio: string;
  data_fim: string;
  status: '0' | '1' | '2' | '3'; // 0=finalizado, 1=transmitindo, 2=agendado, 3=erro
  duracao?: string;
}

interface Playlist {
  id: number;
  nome: string;
  total_videos?: number;
  duracao_total?: number;
}

interface Logo {
  id: number;
  nome: string;
  url: string;
  tamanho: number;
  tipo_arquivo: string;
}

interface LiveTransmissionSettings {
  titulo: string;
  descricao: string;
  tipo: string;
  live_servidor: string;
  live_chave: string;
  inicio_imediato: boolean;
  data_inicio?: string;
  data_fim?: string;
}

interface StreamStatus {
  is_live: boolean;
  stream_type?: 'playlist' | 'obs';
  transmission?: {
    id: number;
    titulo: string;
    stats: {
      viewers: number;
      bitrate: number;
      uptime: string;
      isActive: boolean;
    };
    platforms: Array<{
      user_platform: {
        platform: Platform;
      };
      status: string;
    }>;
  };
  obs_stream?: {
    is_live: boolean;
    viewers: number;
    bitrate: number;
    uptime: string;
    recording: boolean;
    platforms: any[];
  };
}

const IniciarTransmissao: React.FC = () => {
  const { getToken, user } = useAuth();
  const { streamData, refreshStreamStatus } = useStream();

  const [liveTransmissions, setLiveTransmissions] = useState<LiveTransmission[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);

  const [loading, setLoading] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  const [liveSettings, setLiveSettings] = useState<LiveTransmissionSettings>({
    titulo: '',
    descricao: '',
    tipo: 'youtube',
    live_servidor: 'rtmp://a.rtmp.youtube.com/live2',
    live_chave: '',
    inicio_imediato: true,
    data_inicio: '',
    data_fim: ''
  });

  const [playerUrl, setPlayerUrl] = useState('');

  // Plataformas disponíveis baseadas no PHP
  const availablePlatforms = [
    { id: 'youtube', nome: 'YouTube', rtmp_url: 'rtmp://a.rtmp.youtube.com/live2' },
    { id: 'facebook', nome: 'Facebook', rtmp_url: 'rtmps://live-api-s.facebook.com:443/rtmp' },
    { id: 'twitch', nome: 'Twitch', rtmp_url: 'rtmp://live-dfw.twitch.tv/app' },
    { id: 'periscope', nome: 'Periscope', rtmp_url: 'rtmp://ca.pscp.tv:80/x' },
    { id: 'vimeo', nome: 'Vimeo', rtmp_url: 'rtmp://rtmp.cloud.vimeo.com/live' },
    { id: 'steam', nome: 'Steam Valve', rtmp_url: 'rtmp://ingest-any-ord1.broadcast.steamcontent.com/app' },
    { id: 'tiktok', nome: 'TikTok', rtmp_url: 'rtmp://...' },
    { id: 'kwai', nome: 'Kwai', rtmp_url: 'rtmp://...' },
    { id: 'custom', nome: 'RTMP Próprio/Custom', rtmp_url: 'rtmp://...' }
  ];

  useEffect(() => {
    loadLiveTransmissions();
    checkStreamStatus();

    // Atualizar status a cada 30 segundos
    const interval = setInterval(checkStreamStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLiveTransmissions = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/lives', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLiveTransmissions(data.lives || []);
      }
    } catch (error) {
      console.error('Erro ao carregar transmissões:', error);
    }
  };

  const checkStreamStatus = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setStreamStatus(data);

      // Atualizar contexto de stream
      refreshStreamStatus();
      
      // Se há transmissão ativa, configurar player
      if (data.is_live) {
        const baseUrl = process.env.NODE_ENV === 'production' 
          ? 'http://samhost.wcore.com.br:3001'
          : 'http://localhost:3001';
        
        if (data.stream_type === 'obs') {
          setPlayerUrl(`${baseUrl}/api/player-port/iframe?login=${userLogin}&stream=${userLogin}_live&player=1&contador=true`);
        } else if (data.transmission) {
          setPlayerUrl(`${baseUrl}/api/player-port/iframe?login=${userLogin}&playlist=${data.transmission.codigo_playlist}&player=1&contador=true`);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  };

  const handlePlatformChange = (tipo: string) => {
    const platform = availablePlatforms.find(p => p.id === tipo);
    if (platform) {
      setLiveSettings(prev => ({
        ...prev,
        tipo,
        live_servidor: platform.rtmp_url
      }));
    }
  };

  const handleStartLiveTransmission = async () => {
    if (!liveSettings.live_chave) {
      toast.error('Chave de transmissão é obrigatória');
      return;
    }

    if (!liveSettings.live_servidor) {
      toast.error('Servidor RTMP é obrigatório');
      return;
    }

    // Validar datas se não for início imediato
    if (!liveSettings.inicio_imediato) {
      if (!liveSettings.data_inicio || !liveSettings.data_fim) {
        toast.error('Data de início e fim são obrigatórias para transmissões agendadas');
        return;
      }
      
      const dataInicio = new Date(liveSettings.data_inicio);
      const dataFim = new Date(liveSettings.data_fim);
      
      if (dataFim <= dataInicio) {
        toast.error('Data de fim deve ser posterior à data de início');
        return;
      }
      
      // Verificar limite de 24 horas
      const diffHours = (dataFim.getTime() - dataInicio.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        toast.error('Tempo máximo de transmissão é 24 horas');
        return;
      }
    }

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/start-live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...liveSettings,
          // Converter datas para formato do banco
          data_inicio: liveSettings.data_inicio ? 
            new Date(liveSettings.data_inicio).toISOString().slice(0, 19).replace('T', ' ') : null,
          data_fim: liveSettings.data_fim ? 
            new Date(liveSettings.data_fim).toISOString().slice(0, 19).replace('T', ' ') : null
        })
      });

      const result = await response.json();

      if (result.success) {
        if (liveSettings.inicio_imediato) {
          toast.success(`Transmissão para ${liveSettings.tipo} iniciada com sucesso!`);
        } else {
          toast.success(`Transmissão para ${liveSettings.tipo} agendada com sucesso!`);
        }

        loadLiveTransmissions();
        checkStreamStatus();
        setShowLiveModal(false);

        // Reset form
        setLiveSettings(prev => ({
          ...prev,
          live_chave: '',
          data_inicio: '',
          data_fim: ''
        }));
      } else {
        toast.error(result.error || 'Erro ao configurar transmissão');
      }
    } catch (error) {
      console.error('Erro ao configurar transmissão:', error);
      toast.error('Erro ao configurar transmissão');
    } finally {
      setLoading(false);
    }
  };

  const handleStopLiveTransmission = async (liveId: number) => {
    if (!confirm('Deseja realmente finalizar esta transmissão?')) return;

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/stop-live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          live_id: liveId
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Transmissão finalizada com sucesso!');
        loadLiveTransmissions();
        checkStreamStatus();
      } else {
        toast.error(result.error || 'Erro ao finalizar transmissão');
      }
    } catch (error) {
      console.error('Erro ao finalizar transmissão:', error);
      toast.error('Erro ao finalizar transmissão');
    } finally {
      setLoading(false);
    }
  };

  const handleRestartLiveTransmission = async (liveId: number) => {
    if (!confirm('Deseja reiniciar esta transmissão?')) return;

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/restart-live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ live_id: liveId })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Transmissão reiniciada com sucesso!');
        loadLiveTransmissions();
        checkStreamStatus();
      } else {
        toast.error(result.error || 'Erro ao reiniciar transmissão');
      }
    } catch (error) {
      console.error('Erro ao reiniciar transmissão:', error);
      toast.error('Erro ao reiniciar transmissão');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLiveTransmission = async (liveId: number) => {
    if (!confirm('Deseja remover esta transmissão?')) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/streaming/remove-live/${liveId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Transmissão removida com sucesso!');
        loadLiveTransmissions();
      } else {
        toast.error(result.error || 'Erro ao remover transmissão');
      }
    } catch (error) {
      console.error('Erro ao remover transmissão:', error);
      toast.error('Erro ao remover transmissão');
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case '1': return 'Transmitindo/Live';
      case '2': return 'Agendado/Scheduled';
      case '3': return 'Erro';
      default: return 'Finalizado/Finished';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case '1': return 'bg-green-100 text-green-800';
      case '2': return 'bg-blue-100 text-blue-800';
      case '3': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const calculateDuration = (live: LiveTransmission) => {
    if (live.status === '1') {
      // Transmitindo - calcular duração desde o início
      const inicio = new Date(live.data_inicio);
      const agora = new Date();
      const diffMs = agora.getTime() - inicio.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else if (live.status === '0' && live.data_inicio && live.data_fim) {
      // Finalizado - calcular duração total
      const inicio = new Date(live.data_inicio);
      const fim = new Date(live.data_fim);
      const diffMs = fim.getTime() - inicio.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    }
    return '00:00:00';
  };

  const activeLiveTransmissions = liveTransmissions.filter(live => live.status === '1');
  const hasActiveLive = activeLiveTransmissions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Link to="/dashboard" className="flex items-center text-primary-600 hover:text-primary-800">
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span>Voltar ao Dashboard</span>
        </Link>
      </div>

      <div className="flex items-center space-x-3">
        <Radio className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Lives</h1>
      </div>

      {/* Informações sobre o sistema */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-medium mb-2">Sistema de Transmissão para Redes Sociais</h3>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• <strong>Domínio Wowza:</strong> https://stmv1.udicast.com (sempre usar este domínio)</li>
              <li>• <strong>Fonte RTMP:</strong> rtmp://stmv1.udicast.com:1935/{userLogin}/{userLogin}</li>
              <li>• <strong>Plataformas suportadas:</strong> YouTube, Facebook, Twitch, TikTok, Kwai, Steam, Vimeo, Periscope</li>
              <li>• <strong>Tempo máximo:</strong> 24 horas por transmissão</li>
              <li>• <strong>Tecnologia:</strong> FFmpeg + Screen para transmissões contínuas</li>
              <li>• <strong>Configuração:</strong> Obtenha servidor e chave na conta da rede social escolhida</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Transmissões Ativas */}
      {hasActiveLive && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-4 flex items-center">
            <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse mr-3"></div>
            TRANSMISSÕES ATIVAS
          </h2>
          
          <div className="space-y-3">
            {activeLiveTransmissions.map((live) => (
              <div key={live.id} className="bg-white p-4 rounded-lg border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 capitalize">{live.tipo}</h3>
                    <p className="text-sm text-gray-600">
                      Iniciado: {formatDateTime(live.data_inicio)} • 
                      Duração: {calculateDuration(live)}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      {live.live_servidor}/{live.live_chave.substring(0, 10)}...
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const streamUrl = `http://stmv1.udicast.com:1935/${userLogin}/${userLogin}/playlist.m3u8`;
                        setPlayerUrl(streamUrl);
                        setShowPlayerModal(true);
                      }}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Visualizar
                    </button>
                    <button
                      onClick={() => handleStopLiveTransmission(live.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Finalizar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Transmissões */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Transmissões</h2>
          <button
            onClick={() => setShowLiveModal(true)}
            className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Transmissão
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Live</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Início</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Fim</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Duração</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {liveTransmissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    Nenhuma transmissão configurada
                  </td>
                </tr>
              ) : (
                liveTransmissions.map((live) => (
                  <tr key={live.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Radio className="h-4 w-4 text-blue-600" />
                        <span className="font-medium capitalize">{live.tipo}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {formatDateTime(live.data_inicio)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {formatDateTime(live.data_fim)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {calculateDuration(live)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(live.status)}`}>
                        {getStatusText(live.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center space-x-2">
                        {live.status === '1' && (
                          <>
                            <button
                              onClick={() => {
                                const streamUrl = `http://stmv1.udicast.com:1935/${userLogin}/${userLogin}/playlist.m3u8`;
                                setPlayerUrl(streamUrl);
                                setShowPlayerModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800 p-1"
                              title="Visualizar transmissão"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleStopLiveTransmission(live.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Finalizar transmissão"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        
                        {(live.tipo !== 'facebook' && live.tipo !== 'tiktok' && live.tipo !== 'kwai') && (
                          <button
                            onClick={() => handleRestartLiveTransmission(live.id)}
                            className="text-green-600 hover:text-green-800 p-1"
                            title="Reiniciar transmissão"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleRemoveLiveTransmission(live.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Remover transmissão"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Nova Transmissão */}
      {showLiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Cadastrar Live</h3>
                <button
                  onClick={() => setShowLiveModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-4 bg-yellow-50 border-b border-yellow-200">
              <div className="flex items-start">
                <AlertCircle className="h-4 w-4 text-yellow-600 mr-2 mt-0.5" />
                <p className="text-yellow-800 text-sm">
                  O servidor e chave devem ser obtidos na conta da rede social escolhida. 
                  Tempo máximo de transmissão é 24 horas.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Live</label>
                <select
                  value={liveSettings.tipo}
                  onChange={(e) => handlePlatformChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                >
                  {availablePlatforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Servidor RTMP *
                </label>
                <input
                  type="text"
                  value={liveSettings.live_servidor}
                  onChange={(e) => setLiveSettings(prev => ({ ...prev, live_servidor: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  placeholder="rtmp://servidor.com/live"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chave/Key *
                </label>
                <input
                  type="text"
                  value={liveSettings.live_chave}
                  onChange={(e) => setLiveSettings(prev => ({ ...prev, live_chave: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Chave de transmissão da plataforma"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={liveSettings.inicio_imediato}
                    onChange={(e) => setLiveSettings(prev => ({ ...prev, inicio_imediato: e.target.checked }))}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="ml-3 text-sm text-gray-700">Iniciar Imediatamente</span>
                </label>
              </div>

              {!liveSettings.inicio_imediato && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Início *
                    </label>
                    <input
                      type="datetime-local"
                      value={liveSettings.data_inicio}
                      onChange={(e) => setLiveSettings(prev => ({ ...prev, data_inicio: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Término *
                    </label>
                    <input
                      type="datetime-local"
                      value={liveSettings.data_fim}
                      onChange={(e) => setLiveSettings(prev => ({ ...prev, data_fim: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowLiveModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleStartLiveTransmission}
                disabled={loading || !liveSettings.live_chave}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                <Radio className="h-4 w-4 mr-2" />
                {loading ? 'Configurando...' : liveSettings.inicio_imediato ? 'Iniciar Live' : 'Agendar Live'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Player */}
      {showPlayerModal && playerUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4">
          <div className="bg-black rounded-lg relative max-w-6xl w-full h-[80vh]">
            {/* Controles do Modal */}
            <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
              <button
                onClick={() => window.open(playerUrl, '_blank')}
                className="text-white bg-blue-600 hover:bg-blue-700 rounded-full p-3 transition-colors duration-200 shadow-lg"
                title="Abrir em nova aba"
              >
                <ExternalLink size={20} />
              </button>
              
              <button
                onClick={() => setShowPlayerModal(false)}
                className="text-white bg-red-600 hover:bg-red-700 rounded-full p-3 transition-colors duration-200 shadow-lg"
                title="Fechar player"
              >
                <X size={20} />
              </button>
            </div>

            {/* Título da Transmissão */}
            <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
              <h3 className="font-medium">📺 Transmissão ao Vivo</h3>
              <p className="text-xs opacity-80">
                URL: http://stmv1.udicast.com:1935/{userLogin}/{userLogin}/playlist.m3u8
              </p>
            </div>

            {/* Player */}
            <div className="w-full h-full p-4 pt-16">
              <IFrameVideoPlayer
                src={playerUrl}
                title="Transmissão ao Vivo"
                isLive={true}
                autoplay={true}
                controls={true}
                className="w-full h-full"
                onError={(error) => {
                  console.error('Erro no player de transmissão:', error);
                  toast.error('Erro ao carregar transmissão');
                }}
                onReady={() => {
                  console.log('Player de transmissão pronto');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Informações Técnicas */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Informações de Transmissão</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Fonte RTMP (Seu Stream)</h3>
            <div className="bg-gray-100 p-3 rounded-md">
              <p className="font-mono text-sm">
                rtmp://stmv1.udicast.com:1935/{userLogin}/{userLogin}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Este é o stream que será capturado e retransmitido
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">URL de Visualização (HLS)</h3>
            <div className="bg-gray-100 p-3 rounded-md">
              <p className="font-mono text-sm">
                http://stmv1.udicast.com:1935/{userLogin}/{userLogin}/playlist.m3u8
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              URL para visualizar sua transmissão
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="text-blue-900 font-medium mb-2">🔧 Como Funciona</h4>
          <ul className="text-blue-800 text-sm space-y-1">
            <li>• <strong>Captura:</strong> FFmpeg captura seu stream RTMP local</li>
            <li>• <strong>Retransmissão:</strong> Envia para a plataforma escolhida (YouTube, Facebook, etc.)</li>
            <li>• <strong>Configuração especial:</strong> TikTok e Kwai usam crop 9:16 e configurações otimizadas</li>
            <li>• <strong>Facebook:</strong> Usa RTMPS (SSL) na porta 443</li>
            <li>• <strong>Monitoramento:</strong> Sistema verifica se processo FFmpeg está rodando</li>
            <li>• <strong>Screen:</strong> Usa GNU Screen para manter processo em background</li>
          </ul>
        </div>
      </div>

      {/* Aviso importante */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-yellow-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-yellow-900 font-medium mb-2">⚠️ Instruções Importantes</h3>
            <ul className="text-yellow-800 text-sm space-y-1">
              <li>• <strong>Não é necessário deixar esta página aberta</strong> após iniciar a transmissão</li>
              <li>• Verifique o sinal no canal escolhido antes de iniciar</li>
              <li>• Inicie a transmissão no OBS ou software de streaming após configurar aqui</li>
              <li>• Para <strong>TikTok e Kwai:</strong> O sistema aplicará automaticamente crop 9:16</li>
              <li>• Para <strong>Facebook:</strong> Certifique-se de que sua conta permite transmissões ao vivo</li>
              <li>• <strong>Limite de tempo:</strong> Máximo 24 horas por transmissão</li>
              <li>• <strong>Reiniciar:</strong> Disponível apenas para YouTube, Twitch, Vimeo, Steam e RTMP próprio</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IniciarTransmissao;
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Upload de Logo</h3>
                <button
                  onClick={() => setShowLogoUpload(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome da Logo *
                </label>
                <input
                  type="text"
                  value={logoUpload.nome}
                  onChange={(e) => setLogoUpload(prev => ({ ...prev, nome: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Digite um nome para a logo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Arquivo de Imagem *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoUpload(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formatos suportados: PNG, JPG, GIF, WebP (máx. 10MB)
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowLogoUpload(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogoUpload}
                disabled={logoUpload.uploading || !logoUpload.file || !logoUpload.nome}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                <Upload className="h-4 w-4 mr-2" />
                {logoUpload.uploading ? 'Enviando...' : 'Enviar Logo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Informações de Ajuda */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-medium mb-2">Como usar</h3>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• Configure suas plataformas de transmissão (YouTube, Facebook, etc.)</li>
              <li>• <strong>IMPORTANTE:</strong> Certifique-se de que a Stream Key está correta para cada plataforma</li>
              <li>• Selecione uma playlist com vídeos para transmitir</li>
              <li>• Escolha as plataformas onde deseja transmitir simultaneamente</li>
              <li>• Configure opções avançadas como logo e gravação</li>
              <li>• Clique em "Iniciar Transmissão" para começar</li>
              <li>• Para transmissão via OBS, use a página "Dados de Conexão"</li>
              <li>• <strong>Troubleshooting:</strong> Se a transmissão não aparecer na plataforma, verifique se a Stream Key está correta</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IniciarTransmissao;