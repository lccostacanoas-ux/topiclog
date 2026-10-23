/* ============================================================================
   TOPIC LOG — MÓDULO DE PERMISSÕES TRANSPARENTES (PR-MOB-01 / LGPD D05)
   Solicitação de Câmera e Localização Mediante Finalidade Explícita
   ============================================================================ */

export interface PermissionResult<T = void> {
  readonly granted: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly userMessage?: string;
}

/**
 * Solicita acesso à câmera exclusivamente para a finalidade operacional informada.
 * A câmera NUNCA é ativada em segundo plano ou para fins não autorizados.
 */
export async function requestCameraPermission(
  operationalPurpose: string
): Promise<PermissionResult<MediaStream>> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      error: "CAMERA_NOT_SUPPORTED",
      userMessage: "Acesso à câmera não é suportado pelo seu navegador atual."
    };
  }

  try {
    // Registra propósito operacional no console de desenvolvimento
    if (process.env.NODE_ENV === "development") {
      console.log(`[Permissões LGPD] Solicitando câmera com propósito: ${operationalPurpose}`);
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }, // Preferência pela câmera traseira para fotos de pacotes
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    return {
      granted: true,
      data: stream
    };
  } catch (err: any) {
    let message = "Permissão de câmera negada. É necessário autorizar a câmera para fotografar o comprovante.";
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      message = "Nenhuma câmera física detectada no dispositivo.";
    } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      message = "A câmera já está sendo utilizada por outro aplicativo.";
    }

    return {
      granted: false,
      error: err.name || "CAMERA_PERMISSION_DENIED",
      userMessage: message
    };
  }
}

/**
 * Solicita geolocalização pontual exclusivamente para o propósito declarado.
 * A Topic Log não realiza monitoramento de GPS contínuo e invasivo em segundo plano.
 */
export async function requestGeolocationPermission(
  operationalPurpose: string
): Promise<PermissionResult<{ latitude: number; longitude: number; accuracyMeters: number }>> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      granted: false,
      error: "GEOLOCATION_NOT_SUPPORTED",
      userMessage: "Geolocalização não é suportada pelo seu dispositivo ou navegador."
    };
  }

  return new Promise((resolve) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[Permissões LGPD] Solicitando localização com propósito: ${operationalPurpose}`);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          granted: true,
          data: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy
          }
        });
      },
      (positionError) => {
        let message = "Acesso à localização negado.";
        if (positionError.code === positionError.PERMISSION_DENIED) {
          message = "Permissão de localização negada pelo usuário.";
        } else if (positionError.code === positionError.POSITION_UNAVAILABLE) {
          message = "Informações de localização indisponíveis no momento.";
        } else if (positionError.code === positionError.TIMEOUT) {
          message = "Tempo limite esgotado ao buscar localização do dispositivo.";
        }

        resolve({
          granted: false,
          error: "GEOLOCATION_DENIED",
          userMessage: message
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}
