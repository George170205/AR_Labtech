import React, { useState, useRef } from 'react';
import { validateSVG } from '../utils/svgValidator';
import SVGZoneConfigurator from './SVGZoneConfigurator';
import { injectZoneMetadata } from '../utils/svgMetaInjector';
import './TemplateUploadModal.css';

export default function TemplateUploadModal({ onClose, onNext }) {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('🐉');
    const [svgFile, setSvgFile] = useState(null);
    const [svgString, setSvgString] = useState('');
    const [validation, setValidation] = useState(null);
    const [referenceImages, setReferenceImages] = useState([]);
    const [step, setStep] = useState(1);
    
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);

    const handleSvgUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setSvgFile(file);
        const text = await file.text();
        setSvgString(text);
        
        const result = validateSVG(text);
        setValidation(result);
    };

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        setReferenceImages(prev => [...prev, ...files].slice(0, 5)); // Max 5
    };

    const handleRemoveImage = (index) => {
        setReferenceImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleNext = () => {
        if (!name || !svgFile || !validation?.valid) return;
        setStep(2);
    };

    const handleSaveConfig = (zonesConfig) => {
        const finalSvg = injectZoneMetadata(svgString, zonesConfig);
        onNext({
            name,
            icon,
            svgString: finalSvg,
            referenceImages,
        });
    };

    if (step === 2) {
        return (
            <div className="template-modal-overlay">
                <div className="template-modal step2-modal">
                    <SVGZoneConfigurator 
                        svgString={svgString} 
                        onSave={handleSaveConfig} 
                        onCancel={() => setStep(1)} 
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="template-modal-overlay">
            <div className="template-modal">
                <button className="template-modal-close" onClick={onClose}>✕</button>
                <h2>Nueva plantilla</h2>

                <div className="form-group">
                    <label>Nombre del animal</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        placeholder="Ej. Dragón"
                    />
                </div>

                <div className="form-group">
                    <label>Ícono (emoji)</label>
                    <input 
                        type="text" 
                        value={icon} 
                        onChange={(e) => setIcon(e.target.value)} 
                        maxLength="2"
                        className="emoji-input"
                    />
                </div>

                <div className="form-group">
                    <label>Archivo SVG</label>
                    <div className="upload-box">
                        {svgFile ? (
                            <div className="file-selected">
                                📎 {svgFile.name}
                                <button onClick={() => fileInputRef.current?.click()}>Cambiar</button>
                            </div>
                        ) : (
                            <button onClick={() => fileInputRef.current?.click()}>Seleccionar SVG</button>
                        )}
                        <input 
                            type="file" 
                            accept=".svg" 
                            ref={fileInputRef} 
                            onChange={handleSvgUpload} 
                            hidden 
                        />
                    </div>
                    
                    {validation && (
                        <div className={`validation-msg ${validation.valid ? 'success' : 'error'}`}>
                            {validation.valid 
                                ? `✅ SVG válido — ${validation.groupCount} grupos detectados` 
                                : `❌ Error: ${validation.errors.join(', ')}`}
                            
                            {validation.warnings.map((w, i) => (
                                <div key={i} className="warning-msg">⚠️ {w}</div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="form-group">
                    <label>Fotos de referencia (para detección automática)</label>
                    <p className="help-text">Sube 3–5 fotos del dibujo coloreado</p>
                    
                    <div className="reference-images-grid">
                        {referenceImages.map((file, i) => (
                            <div key={i} className="ref-image-thumb">
                                <img src={URL.createObjectURL(file)} alt="Ref" />
                                <button className="remove-img" onClick={() => handleRemoveImage(i)}>✕</button>
                            </div>
                        ))}
                        {referenceImages.length < 5 && (
                            <button className="add-img-btn" onClick={() => imageInputRef.current?.click()}>+</button>
                        )}
                    </div>
                    <input 
                        type="file" 
                        accept="image/jpeg, image/png, image/webp" 
                        multiple 
                        ref={imageInputRef} 
                        onChange={handleImageUpload} 
                        hidden 
                    />
                </div>

                <div className="modal-actions">
                    <button className="btn-cancel" onClick={onClose}>Cancelar</button>
                    <button 
                        className="btn-next" 
                        onClick={handleNext}
                        disabled={!name || !svgFile || !validation?.valid}
                    >
                        Siguiente: Configurar →
                    </button>
                </div>
            </div>
        </div>
    );
}
