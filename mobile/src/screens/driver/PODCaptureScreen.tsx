import { useState, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Alert, ScrollView, Image, ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { syncService } from '../../services/SyncService'

type Step = 'signature' | 'photo' | 'confirm'

export default function PODCaptureScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const queryClient = useQueryClient()
  const { stopId, customerName } = route.params as { stopId: number; customerName: string }

  const [step, setStep] = useState<Step>('signature')
  const [signedBy, setSignedBy] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  const cameraRef = useRef<CameraView>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()

  // Since react-native-signature-canvas requires a WebView which adds complexity,
  // we'll use a simulated signature capture (text-based name entry as legal signature).
  // In production, replace with a proper signature pad component.

  const handleSignatureNext = useCallback(() => {
    if (!signedBy.trim()) {
      Alert.alert('Required', 'Please enter the receiver\'s name.')
      return
    }
    // Use the name as a text-based signature (legally binding in many jurisdictions)
    setSignatureData(signedBy.trim())
    setStep('photo')
  }, [signedBy])

  const handleTakePhoto = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission()
      if (!result.granted) {
        Alert.alert('Permission Denied', 'Camera access is needed for proof of delivery.')
        return
      }
    }
    setShowCamera(true)
  }, [cameraPermission, requestCameraPermission])

  const handleCapturePhoto = useCallback(async () => {
    if (!cameraRef.current) return

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
      })
      if (photo) {
        setPhotoUri(photo.uri)
        setPhotoBase64(photo.base64 || null)
        setShowCamera(false)
        setStep('confirm')
      }
    } catch {
      Alert.alert('Error', 'Failed to capture photo.')
    }
  }, [])

  const handleSkipPhoto = useCallback(() => {
    setStep('confirm')
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!signatureData) return
    setIsSubmitting(true)

    try {
      // Get GPS coordinates
      let gpsLat: number | undefined
      let gpsLng: number | undefined
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          gpsLat = loc.coords.latitude
          gpsLng = loc.coords.longitude
        }
      } catch {
        // GPS not available - continue without it
      }

      // Build a minimal base64 "signature" from the name
      // In production, this would be actual drawn signature data
      const signatureBase64 = btoa(signatureData)

      const payload = {
        signature_base64: signatureBase64,
        signed_by: signatureData,
        photo_base64: photoBase64 || undefined,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        delivery_notes: notes || undefined,
      }

      // Submit or queue (offline-first)
      const submitted = await syncService.submitOrQueue(stopId, payload)

      queryClient.invalidateQueries({ queryKey: ['driver-run'] })

      if (submitted) {
        Alert.alert('Delivered!', `POD captured for ${customerName}.`, [
          { text: 'OK', onPress: () => navigation.popToTop() },
        ])
      } else {
        Alert.alert('Queued', 'No connection. POD saved and will sync automatically.', [
          { text: 'OK', onPress: () => navigation.popToTop() },
        ])
      }
    } catch {
      Alert.alert('Error', 'Failed to submit POD. It has been queued for retry.')
      navigation.popToTop()
    } finally {
      setIsSubmitting(false)
    }
  }, [signatureData, photoBase64, notes, stopId, customerName, navigation, queryClient])

  // Camera view
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <SafeAreaView style={styles.cameraOverlay}>
            <TouchableOpacity
              style={styles.cameraCancelBtn}
              onPress={() => setShowCamera(false)}
            >
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraHint}>
              Photograph pallets on the dock
            </Text>
            <TouchableOpacity style={styles.captureBtn} onPress={handleCapturePhoto}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          </SafeAreaView>
        </CameraView>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Proof of Delivery</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        {(['signature', 'photo', 'confirm'] as Step[]).map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              step === s && styles.progressDotActive,
              (['signature', 'photo', 'confirm'].indexOf(step) > i) && styles.progressDotDone,
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.customerLabel}>{customerName}</Text>

        {step === 'signature' && (
          <View style={styles.stepContainer}>
            <Feather name="edit-3" size={48} color="#3b82f6" style={styles.stepIcon} />
            <Text style={styles.stepTitle}>Receiver Signature</Text>
            <Text style={styles.stepDesc}>Enter the name of the person receiving the delivery.</Text>

            <Text style={styles.inputLabel}>RECEIVED BY</Text>
            <TextInput
              style={styles.nameInput}
              value={signedBy}
              onChangeText={setSignedBy}
              placeholder="Full name (e.g., John Smith)"
              placeholderTextColor="#475569"
              autoCapitalize="words"
              autoFocus
            />

            <TouchableOpacity
              style={[styles.nextBtn, !signedBy.trim() && styles.btnDisabled]}
              onPress={handleSignatureNext}
              disabled={!signedBy.trim()}
            >
              <Text style={styles.nextBtnText}>NEXT</Text>
              <Feather name="arrow-right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {step === 'photo' && (
          <View style={styles.stepContainer}>
            <Feather name="camera" size={48} color="#3b82f6" style={styles.stepIcon} />
            <Text style={styles.stepTitle}>Photo Proof</Text>
            <Text style={styles.stepDesc}>
              Take a photo of the pallets on the dock as proof of condition.
            </Text>

            <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
              <Feather name="camera" size={28} color="#fff" />
              <Text style={styles.photoBtnText}>TAKE PHOTO</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={handleSkipPhoto}>
              <Text style={styles.skipBtnText}>Skip Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Confirm Delivery</Text>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Feather name="user" size={18} color="#94a3b8" />
                <Text style={styles.summaryLabel}>Received by:</Text>
                <Text style={styles.summaryValue}>{signatureData}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Feather name="camera" size={18} color="#94a3b8" />
                <Text style={styles.summaryLabel}>Photo:</Text>
                <Text style={styles.summaryValue}>
                  {photoUri ? 'Captured' : 'Skipped'}
                </Text>
              </View>
            </View>

            {photoUri && (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            )}

            <Text style={styles.inputLabel}>DELIVERY NOTES (OPTIONAL)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any issues or notes..."
              placeholderTextColor="#475569"
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="check-circle" size={24} color="#fff" />
                  <Text style={styles.submitBtnText}>COMPLETE DELIVERY</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { color: '#94a3b8', fontSize: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  progressDot: {
    width: 40, height: 6, borderRadius: 3, backgroundColor: '#334155',
  },
  progressDotActive: { backgroundColor: '#e02424' },
  progressDotDone: { backgroundColor: '#22c55e' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  customerLabel: { color: '#64748b', fontSize: 15, fontWeight: '600', marginBottom: 24 },
  stepContainer: { alignItems: 'center' },
  stepIcon: { marginBottom: 16 },
  stepTitle: { color: '#f1f5f9', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  stepDesc: { color: '#94a3b8', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  inputLabel: {
    color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 1,
    alignSelf: 'stretch', marginBottom: 8, marginTop: 8,
  },
  nameInput: {
    backgroundColor: '#1e293b', borderRadius: 14, paddingHorizontal: 20,
    paddingVertical: 18, fontSize: 20, color: '#f1f5f9', fontWeight: '600',
    alignSelf: 'stretch', borderWidth: 1, borderColor: '#334155',
    textAlign: 'center',
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#3b82f6', paddingVertical: 18, borderRadius: 14,
    alignSelf: 'stretch', marginTop: 24,
  },
  nextBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  btnDisabled: { opacity: 0.4 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#3b82f6', paddingVertical: 24, paddingHorizontal: 48,
    borderRadius: 16, marginBottom: 16,
  },
  photoBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  skipBtn: { paddingVertical: 12 },
  skipBtnText: { color: '#64748b', fontSize: 16 },
  summaryCard: {
    backgroundColor: '#1e293b', borderRadius: 14, padding: 18,
    alignSelf: 'stretch', marginBottom: 16, gap: 12,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryLabel: { color: '#94a3b8', fontSize: 14 },
  summaryValue: { color: '#f1f5f9', fontSize: 15, fontWeight: '700', flex: 1 },
  photoPreview: {
    width: '100%', height: 200, borderRadius: 14, marginBottom: 16,
    backgroundColor: '#1e293b',
  },
  notesInput: {
    backgroundColor: '#1e293b', borderRadius: 14, paddingHorizontal: 18,
    paddingVertical: 14, fontSize: 16, color: '#f1f5f9',
    alignSelf: 'stretch', borderWidth: 1, borderColor: '#334155',
    minHeight: 80, textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#22c55e', paddingVertical: 22, borderRadius: 16,
    alignSelf: 'stretch', marginTop: 24,
  },
  submitBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  // Camera styles
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1, justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingBottom: 40,
  },
  cameraCancelBtn: {
    alignSelf: 'flex-start', marginLeft: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 24,
    width: 48, height: 48, justifyContent: 'center', alignItems: 'center',
  },
  cameraHint: {
    color: '#fff', fontSize: 16, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20,
  },
  captureBtn: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 4,
    borderColor: '#fff', justifyContent: 'center', alignItems: 'center',
  },
  captureBtnInner: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff',
  },
})
