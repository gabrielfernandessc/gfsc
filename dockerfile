# Usar uma imagem base com Python e dependências
FROM python:3.10-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar os arquivos do projeto
COPY app.py index.html ./

# Instalar dependências Python
RUN pip install flask flask-cors selenium beautifulsoup4 reportlab

# Configurar variáveis de ambiente para o Selenium
ENV PYTHONUNBUFFERED=1

# Expor a porta 5000
EXPOSE 5000

# Comando para rodar o aplicativo
CMD ["python", "app.py"]
